//! The session over real WebSocket connections (plain ws on a random port).

mod common;

use common::*;
use ninjoy_session::protocol::{HostMessage, ListEntry, ListStatus, PageMessage};
use ninjoy_session::{SessionConfig, SessionEvent, SlotStatus};

// ---------- US1: join as a controller and play ----------

#[tokio::test]
async fn new_controllers_take_the_lowest_free_number() {
    let host = start_host(SessionConfig::default()).await;
    let (_a, one) = Page::join(host.port, 0, device(1)).await;
    let (b, two) = Page::join(host.port, 0, device(2)).await;
    let (_c, three) = Page::join(host.port, 0, device(3)).await;
    assert_eq!((one, two, three), (1, 2, 3));
    host.session.kick(2).unwrap();
    drop(b);
    let (_d, again) = Page::join(host.port, 0, device(4)).await;
    assert_eq!(again, 2);
    let (_e, four) = Page::join(host.port, 4, device(5)).await;
    assert_eq!(four, 4);
}

#[tokio::test]
async fn every_state_reaches_the_sink_in_order_and_late_ones_are_dropped() {
    let host = start_host(SessionConfig::default()).await;
    let (mut page, slot) = Page::join(host.port, 0, device(1)).await;
    for b in [1, 2, 4] {
        page.state(state(b)).await;
    }
    // a duplicate and an older sequence are ignored
    page.send(PageMessage::State {
        seq: 3,
        state: state(99),
    })
    .await;
    page.send(PageMessage::State {
        seq: 2,
        state: state(98),
    })
    .await;
    page.state(state(8)).await;
    eventually("4 states", || host.sink.states(slot).len() == 4).await;
    let buttons: Vec<u32> = host.sink.states(slot).iter().map(|s| s.buttons).collect();
    assert_eq!(buttons, vec![1, 2, 4, 8]);
    let info = host.session.slots();
    assert_eq!(info[0].status, SlotStatus::Connected);
    assert_eq!(info[0].device.as_ref().unwrap().device, "SM-S911B");
    assert_eq!(info[0].last_state.unwrap().buttons, 8);
}

#[tokio::test]
async fn controllers_created_by_the_host_wait_for_a_device() {
    let host = start_host(SessionConfig::default()).await;
    let mut events = host.session.events();
    let (_a, _) = Page::join(host.port, 0, device(1)).await;
    let (_b, _) = Page::join(host.port, 0, device(2)).await;
    assert_eq!(host.session.create_slot(), 3);
    event(&mut events, |e| *e == SessionEvent::SlotCreated(3)).await;
    assert_eq!(host.session.slots()[2].status, SlotStatus::Waiting);
    host.session.create_slot_at(7).unwrap();
    assert!(host.session.create_slot_at(7).is_err());
    let (_c, three) = Page::join(host.port, 3, device(3)).await;
    assert_eq!(three, 3);
    host.session.remove_slot(7).unwrap();
    assert!(
        host.session.remove_slot(3).is_err(),
        "a connected controller is not removed"
    );
    assert_eq!(host.session.slots().len(), 3);
}

#[tokio::test]
async fn the_controller_list_is_sent_and_updated() {
    let host = start_host(SessionConfig::default()).await;
    let (_a, _) = Page::join(host.port, 0, device(1)).await;
    let mut lister = Page::connect(host.port).await;
    lister.send(PageMessage::List { device: device(9) }).await;
    assert_eq!(
        lister.recv().await,
        Some(HostMessage::SlotList {
            phones_can_create: true,
            entries: vec![ListEntry {
                slot: 1,
                status: ListStatus::Connected
            }]
        })
    );
    host.session.create_slot();
    assert_eq!(
        lister.recv().await,
        Some(HostMessage::SlotList {
            phones_can_create: true,
            entries: vec![
                ListEntry {
                    slot: 1,
                    status: ListStatus::Connected
                },
                ListEntry {
                    slot: 2,
                    status: ListStatus::Waiting
                }
            ]
        })
    );
    host.session.set_phones_can_create(false);
    match lister.recv().await {
        Some(HostMessage::SlotList {
            phones_can_create: false,
            ..
        }) => {}
        other => panic!("expected a list update, got {other:?}"),
    }
    // the same connection then joins the waiting controller
    lister.hello(2, device(9)).await;
    assert_eq!(
        lister.recv().await,
        Some(HostMessage::Welcome {
            version: 1,
            slot: 2
        })
    );
}

#[tokio::test]
async fn phones_cannot_create_controllers_when_the_host_says_so() {
    let host = start_host(SessionConfig::default()).await;
    host.session.set_phones_can_create(false);
    host.session.create_slot_at(5).unwrap();
    let mut page = Page::connect(host.port).await;
    page.hello(0, device(1)).await;
    assert_eq!(page.recv().await, Some(HostMessage::InUse { requested: 0 }));
    page.hello(2, device(1)).await;
    assert_eq!(page.recv().await, Some(HostMessage::InUse { requested: 0 }));
    page.hello(5, device(1)).await;
    assert_eq!(
        page.recv().await,
        Some(HostMessage::Welcome {
            version: 1,
            slot: 5
        })
    );
}

#[tokio::test]
async fn a_newer_protocol_version_is_told_to_update() {
    let host = start_host(SessionConfig::default()).await;
    let mut page = Page::connect(host.port).await;
    page.send(PageMessage::Hello {
        version: 9,
        slot: 0,
        device: device(1),
    })
    .await;
    assert_eq!(
        page.recv().await,
        Some(HostMessage::VersionMismatch { host_version: 1 })
    );
    assert_eq!(page.recv().await, None);
}

#[tokio::test]
async fn the_page_is_served() {
    let host = start_host(SessionConfig::default()).await;
    let get = |path: &str| {
        let url = format!("http://127.0.0.1:{}{}", host.port, path);
        async move { http_get(&url).await }
    };
    let (status, controller) = get("/3?plain").await;
    assert_eq!(status, 200);
    assert!(
        controller.contains("assets/main"),
        "controller page: {controller}"
    );
    let (status, explanation) = get("/").await;
    assert_eq!(status, 200);
    // the plain address shows the certificate explanation, not the controller
    assert!(
        !explanation.contains("assets/main"),
        "explanation page: {explanation}"
    );
    assert_eq!(get("/missing.js").await.0, 404);
    assert_eq!(get("/../Cargo.toml").await.0, 404);
}

/// Minimal HTTP/1.1 GET, enough for these tests.
async fn http_get(url: &str) -> (u16, String) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let rest = url.strip_prefix("http://").unwrap();
    let (host, path) = rest.split_at(rest.find('/').unwrap());
    let mut stream = tokio::net::TcpStream::connect(host).await.unwrap();
    stream
        .write_all(
            format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n").as_bytes(),
        )
        .await
        .unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).await.unwrap();
    let status = response.split_whitespace().nth(1).unwrap().parse().unwrap();
    (status, response)
}

// ---------- US2: never stuck, always back ----------

fn quick() -> SessionConfig {
    SessionConfig {
        loss_timeout: std::time::Duration::from_millis(200),
        grace: std::time::Duration::from_millis(800),
        ..SessionConfig::default()
    }
}

#[tokio::test]
async fn a_silent_device_is_released_and_its_slot_held() {
    let host = start_host(quick()).await;
    let mut events = host.session.events();
    let (mut page, slot) = Page::join(host.port, 0, device(1)).await;
    page.state(state(1)).await;
    // the page goes quiet (no keepalive, no pong)
    let e = event(&mut events, |e| {
        matches!(e, SessionEvent::Disconnected { .. })
    })
    .await;
    assert_eq!(e, SessionEvent::Disconnected { slot });
    let states = host.sink.states(slot);
    assert_eq!(
        states.last().unwrap().buttons,
        0,
        "released before the event"
    );
    assert!(matches!(
        host.session.slots()[0].status,
        SlotStatus::Held { .. }
    ));
    drop(page);
}

#[tokio::test]
async fn the_same_device_gets_its_slot_back_within_the_grace_period() {
    let host = start_host(quick()).await;
    let mut events = host.session.events();
    let (page, slot) = Page::join(host.port, 0, device(1)).await;
    page.close().await;
    event(&mut events, |e| {
        matches!(e, SessionEvent::Disconnected { .. })
    })
    .await;
    // someone else cannot take it meanwhile
    let mut other = Page::connect(host.port).await;
    other.hello(slot, device(2)).await;
    assert_eq!(
        other.recv().await,
        Some(HostMessage::InUse { requested: slot })
    );
    let (_back, again) = Page::join(host.port, slot, device(1)).await;
    assert_eq!(again, slot);
    event(&mut events, |e| *e == SessionEvent::Reconnected { slot }).await;
}

#[tokio::test]
async fn a_held_slot_is_freed_after_the_grace_period() {
    let host = start_host(quick()).await;
    let mut events = host.session.events();
    let (page, slot) = Page::join(host.port, 0, device(1)).await;
    page.close().await;
    event(&mut events, |e| *e == SessionEvent::Freed { slot }).await;
    let (_other, taken) = Page::join(host.port, 0, device(2)).await;
    assert_eq!(taken, slot, "the number is reused");
}

#[tokio::test]
async fn keepalives_keep_the_slot_and_a_hidden_page_releases_at_once() {
    let host = start_host(quick()).await;
    let mut events = host.session.events();
    let (mut page, slot) = Page::join(host.port, 0, device(1)).await;
    for _ in 0..8 {
        page.state(state(4)).await; // same state, resent like the page's 250 ms keepalive
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    }
    assert!(matches!(
        host.session.slots()[0].status,
        SlotStatus::Connected
    ));
    page.send(PageMessage::Hidden).await;
    eventually("released", || {
        host.sink
            .states(slot)
            .last()
            .is_some_and(|s| s.buttons == 0)
    })
    .await;
    page.state(state(8)).await;
    eventually("resumed", || {
        host.sink
            .states(slot)
            .last()
            .is_some_and(|s| s.buttons == 8)
    })
    .await;
    while let Ok(e) = events.try_recv() {
        assert!(
            !matches!(e, SessionEvent::Disconnected { .. }),
            "kept alive, never disconnected"
        );
    }
}

// ---------- US3: slot already in use and kicks ----------

#[tokio::test]
async fn another_device_gets_in_use_without_affecting_the_player() {
    let host = start_host(SessionConfig::default()).await;
    let (mut player, slot) = Page::join(host.port, 0, device(1)).await;
    let mut other = Page::connect(host.port).await;
    other.hello(slot, device(2)).await;
    assert_eq!(
        other.recv().await,
        Some(HostMessage::InUse { requested: slot })
    );
    player.state(state(16)).await;
    eventually("player still plays", || {
        host.sink
            .states(slot)
            .last()
            .is_some_and(|s| s.buttons == 16)
    })
    .await;
}

#[tokio::test]
async fn the_same_device_in_another_tab_takes_over() {
    let host = start_host(SessionConfig::default()).await;
    let mut events = host.session.events();
    let (mut first, slot) = Page::join(host.port, 0, device(1)).await;
    let (mut second, again) = Page::join(host.port, slot, device(1)).await;
    assert_eq!(again, slot);
    assert_eq!(first.recv().await, Some(HostMessage::OpenedElsewhere));
    assert_eq!(first.recv().await, None, "the old tab is closed");
    event(&mut events, |e| *e == SessionEvent::Reconnected { slot }).await;
    second.state(state(32)).await;
    eventually("new tab plays", || {
        host.sink
            .states(slot)
            .last()
            .is_some_and(|s| s.buttons == 32)
    })
    .await;
    assert!(
        matches!(host.session.slots()[0].status, SlotStatus::Connected),
        "replacing is not a disconnect"
    );
}

#[tokio::test]
async fn a_kicked_player_is_told_released_and_the_number_freed_at_once() {
    let host = start_host(SessionConfig::default()).await;
    let mut events = host.session.events();
    let (mut page, slot) = Page::join(host.port, 0, device(1)).await;
    page.state(state(1)).await;
    eventually("pressed", || {
        host.sink
            .states(slot)
            .last()
            .is_some_and(|s| s.buttons == 1)
    })
    .await;
    host.session.kick(slot).unwrap();
    assert_eq!(
        host.sink.states(slot).last().unwrap().buttons,
        0,
        "released synchronously by kick()"
    );
    assert_eq!(page.recv().await, Some(HostMessage::Kicked));
    assert_eq!(page.recv().await, None);
    event(&mut events, |e| *e == SessionEvent::Kicked { slot }).await;
    event(&mut events, |e| *e == SessionEvent::Freed { slot }).await;
    assert!(host.session.slots().is_empty());
    let (_next, taken) = Page::join(host.port, 0, device(2)).await;
    assert_eq!(taken, slot);
    assert!(host.session.kick(99).is_err());
}

// ---------- US4: feedback from the game ----------

#[tokio::test]
async fn feedback_reaches_the_connected_page_only() {
    use ninjoy_session::Feedback;
    let host = start_host(SessionConfig::default()).await;
    let (mut page, slot) = Page::join(host.port, 0, device(1)).await;
    host.session.send_feedback(
        slot,
        Feedback {
            rumble: Some((1.0, 0.25)),
            lightbar: None,
        },
    );
    assert_eq!(
        page.recv().await,
        Some(HostMessage::Feedback {
            rumble: Some([255, 64]),
            lightbar: None
        })
    );
    host.session.send_feedback(
        slot,
        Feedback {
            rumble: None,
            lightbar: Some([255, 0, 128]),
        },
    );
    assert_eq!(
        page.recv().await,
        Some(HostMessage::Feedback {
            rumble: None,
            lightbar: Some([255, 0, 128])
        })
    );
    host.session.send_feedback(
        slot,
        Feedback {
            rumble: Some((0.0, 0.0)),
            lightbar: Some([1, 2, 3]),
        },
    );
    assert_eq!(
        page.recv().await,
        Some(HostMessage::Feedback {
            rumble: Some([0, 0]),
            lightbar: Some([1, 2, 3])
        })
    );
    // waiting slots and unknown numbers are ignored without errors
    let waiting = host.session.create_slot();
    host.session.send_feedback(
        waiting,
        Feedback {
            rumble: Some((1.0, 1.0)),
            lightbar: None,
        },
    );
    host.session.send_feedback(99, Feedback::default());
}

#[tokio::test]
async fn the_host_measures_the_round_trip_and_tells_the_page() {
    let host = start_host(SessionConfig::default()).await;
    let (mut page, _) = Page::join(host.port, 0, device(1)).await;
    let Some(HostMessage::Ping { nonce, last_rtt: 0 }) = page.recv_any().await else {
        panic!("first ping without a measurement");
    };
    page.send(PageMessage::Pong { nonce }).await;
    eventually("rtt measured", || host.session.slots()[0].rtt.is_some()).await;
    match page.recv_any().await {
        Some(HostMessage::Ping { last_rtt, .. }) => {
            assert!(last_rtt > 0, "the next ping carries the measurement")
        }
        other => panic!("expected a ping, got {other:?}"),
    }
}
