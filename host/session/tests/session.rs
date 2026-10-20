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
