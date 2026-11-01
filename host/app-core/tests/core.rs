//! The app core without a window: controllers, saved state and settings (desktop app T002).

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use ninjoy_app_core::{
    AppCore, CoreConfig, CoreError, PortsMode, PortsSetting, Settings, Theme, data_dir,
};
use ninjoy_devices::Unavailable;
use ninjoy_session::SessionConfig;

static NEXT: AtomicUsize = AtomicUsize::new(0);

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "ninjoy-app-test-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn config(dir: &Path) -> CoreConfig {
    CoreConfig {
        data_dir: dir.to_path_buf(),
        session: SessionConfig {
            plain_ports: vec![0],
            secure_ports: vec![0],
            announce: false,
            ..SessionConfig::default()
        },
        backend: Err(Unavailable {
            reason: "no driver in tests".into(),
            fix: "none".into(),
        }),
        check_setup: false,
    }
}

async fn start(dir: &Path) -> Arc<AppCore> {
    AppCore::start(config(dir)).await.expect("core starts")
}

#[tokio::test(flavor = "multi_thread")]
async fn creates_controllers_with_the_next_or_a_chosen_number() {
    let core = start(&temp_dir()).await;
    assert_eq!(core.create(None), Ok(1));
    assert_eq!(core.create(Some(5)), Ok(5));
    assert_eq!(core.create(None), Ok(2));
    assert_eq!(core.create(Some(5)), Err(CoreError::Taken(5)));
    assert_eq!(core.create(Some(0)), Err(CoreError::Invalid));
    let snap = core.snapshot();
    let numbers: Vec<u16> = snap.controllers.iter().map(|c| c.number).collect();
    assert_eq!(numbers, [1, 2, 5]);
    let c = &snap.controllers[2];
    assert_eq!(c.status, "waiting");
    assert_eq!(c.pad, "unavailable");
    assert!(c.url.ends_with("/5"), "{}", c.url);
    assert!(!snap.driver.ok);
    assert_eq!(snap.driver.reason.as_deref(), Some("no driver in tests"));
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn removes_and_reports_unknown_controllers() {
    let core = start(&temp_dir()).await;
    core.create(Some(3)).unwrap();
    assert_eq!(core.remove(3), Ok(()));
    assert!(core.snapshot().controllers.is_empty());
    assert_eq!(core.remove(3), Err(CoreError::NotFound(3)));
    assert_eq!(core.kick(9), Err(CoreError::NotFound(9)));
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn remembers_created_controllers_across_restarts() {
    let dir = temp_dir();
    let core = start(&dir).await;
    core.create(Some(2)).unwrap();
    core.create(Some(5)).unwrap();
    core.create(Some(7)).unwrap();
    core.remove(7).unwrap();
    core.shutdown().await;

    let core = start(&dir).await;
    let numbers: Vec<u16> = core
        .snapshot()
        .controllers
        .iter()
        .map(|c| c.number)
        .collect();
    assert_eq!(numbers, [2, 5], "recreated as waiting controllers");
    assert!(
        core.snapshot()
            .controllers
            .iter()
            .all(|c| c.status == "waiting")
    );
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn ignores_a_broken_saved_file() {
    let dir = temp_dir();
    std::fs::write(dir.join("app.json"), "{ not json").unwrap();
    let core = start(&dir).await;
    assert_eq!(core.settings(), Settings::default());
    assert!(core.snapshot().controllers.is_empty());
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn keeps_settings_across_restarts() {
    let dir = temp_dir();
    let core = start(&dir).await;
    let defaults = core.settings();
    assert_eq!(defaults.hold_seconds, 60);
    assert!(defaults.phones_can_create);
    assert!(defaults.close_to_tray);
    let changed = Settings {
        theme: Theme::Dark,
        hold_seconds: 120,
        phones_can_create: false,
        start_with_system: true,
        close_to_tray: false,
        ..defaults
    };
    core.update_settings(changed.clone()).await.unwrap();
    assert_eq!(core.snapshot().settings, changed);
    core.shutdown().await;

    let core = start(&dir).await;
    assert_eq!(core.settings(), changed);
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn lists_skins_and_keeps_the_default_skin() {
    let dir = temp_dir();
    // an installed skin in the app's skin folder
    std::fs::create_dir_all(dir.join("skins/arcade")).unwrap();
    std::fs::write(
        dir.join("skins/arcade/skin.json"),
        r#"{"format":2,"name":"Arcade","author":"Carlos","version":"1.0.0"}"#,
    )
    .unwrap();
    let core = start(&dir).await;
    let skins = core.snapshot().skins;
    let ids: Vec<&str> = skins.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["ninjoy", "arcade"]);
    assert!(skins[0].is_default && skins[0].bundled);
    assert!(core.skin_file("arcade", "skin.json").is_some());

    core.update_settings(Settings {
        default_skin: "arcade".into(),
        ..core.settings()
    })
    .await
    .unwrap();
    assert!(core.snapshot().skins[1].is_default);
    core.shutdown().await;

    let core = start(&dir).await;
    assert_eq!(core.settings().default_skin, "arcade");
    assert!(core.snapshot().skins[1].is_default, "applied at start");
    core.set_broken_skins(std::collections::HashMap::from([(
        "arcade".to_owned(),
        "missing touch area".to_owned(),
    )]));
    let snap = core.snapshot();
    assert_eq!(snap.skins[1].broken.as_deref(), Some("missing touch area"));
    assert!(
        snap.skins[0].is_default,
        "a broken default falls back to the official skin"
    );
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn clamps_the_hold_time() {
    let core = start(&temp_dir()).await;
    core.update_settings(Settings {
        hold_seconds: 5,
        ..Settings::default()
    })
    .await
    .unwrap();
    assert_eq!(core.settings().hold_seconds, 10);
    core.update_settings(Settings {
        hold_seconds: 9000,
        ..Settings::default()
    })
    .await
    .unwrap();
    assert_eq!(core.settings().hold_seconds, 300);
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn tells_the_window_when_something_changes() {
    let core = start(&temp_dir()).await;
    let mut changes = core.subscribe();
    core.create(None).unwrap();
    tokio::time::timeout(Duration::from_secs(1), changes.recv())
        .await
        .expect("a change")
        .unwrap();
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn lists_controllers_one_per_line() {
    let core = start(&temp_dir()).await;
    assert_eq!(core.list_lines(), ["no controllers"]);
    core.create(Some(4)).unwrap();
    let lines = core.list_lines();
    assert_eq!(lines.len(), 1);
    assert!(lines[0].starts_with("4  waiting"), "{}", lines[0]);
    core.shutdown().await;
}

#[test]
fn draws_qr_codes_as_svg() {
    let svg = ninjoy_app_core::qr_svg("https://192.168.0.10:8443/1");
    assert!(
        svg.starts_with("<?xml") || svg.starts_with("<svg"),
        "{}",
        &svg[..20]
    );
    assert!(svg.contains("</svg>"));
}

#[test]
fn keeps_data_beside_the_program_and_brings_the_old_data_along() {
    let root = temp_dir();
    let user = root.join("user");
    std::fs::create_dir_all(user.join("skins/arcade")).unwrap();
    std::fs::write(user.join("cert.pem"), "cert").unwrap();
    std::fs::write(user.join("skins/arcade/skin.json"), "{}").unwrap();
    let beside = root.join("program/data");
    std::fs::create_dir_all(root.join("program")).unwrap();

    assert_eq!(data_dir(&beside, &user), beside);
    assert_eq!(
        std::fs::read_to_string(beside.join("cert.pem")).unwrap(),
        "cert",
        "phones keep trusting it"
    );
    assert!(beside.join("skins/arcade/skin.json").is_file());

    // later runs use it as it is
    std::fs::write(user.join("cert.pem"), "newer").unwrap();
    assert_eq!(data_dir(&beside, &user), beside);
    assert_eq!(
        std::fs::read_to_string(beside.join("cert.pem")).unwrap(),
        "cert"
    );

    // a folder that cannot be made falls back to the user's data folder
    std::fs::write(root.join("file"), "").unwrap();
    assert_eq!(data_dir(&root.join("file/data"), &user), user);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_snapshot_has_the_ports_setting_and_no_setup_without_the_check() {
    let core = start(&temp_dir()).await;
    let snap = serde_json::to_value(core.snapshot()).unwrap();
    assert_eq!(
        snap["settings"]["ports"],
        serde_json::json!({ "mode": "automatic", "secure": 443, "plain": 80 })
    );
    // no Linux setup off Linux, nor when the check is off (tests)
    assert!(snap["setup"].is_null());
    assert!(core.setup_check().is_none());
    #[cfg(not(target_os = "linux"))]
    {
        let result = core.setup_configure(None).await;
        assert!(result.setup.is_none() && !result.ports_moved);
    }
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn nothing_creates_controllers_until_linux_allows_it() {
    use ninjoy_app_core::setup::{ItemId, ItemState, SetupItem, SetupView};
    let item = |state| SetupItem {
        id: ItemId::Controllers,
        state,
        critical: true,
        reason: None,
        commands: vec![],
        firewall: None,
    };
    let core = start(&temp_dir()).await;
    core.inject_setup_view(SetupView::new(vec![item(ItemState::Missing)], None));
    assert_eq!(core.create(None), Err(CoreError::SetupNeeded));
    assert!(core.snapshot().controllers.is_empty());
    // phones are refused too, whatever the setting says
    assert!(core.settings().phones_can_create);
    assert!(!phones_may_create(&core).await);

    core.inject_setup_view(SetupView::new(vec![item(ItemState::Done)], None));
    assert_eq!(core.create(None), Ok(1));
    assert!(phones_may_create(&core).await);
    core.shutdown().await;
}

/// Asks the session's controller list, as a phone does, whether phones may create controllers.
async fn phones_may_create(core: &AppCore) -> bool {
    use futures_util::{SinkExt, StreamExt};
    use ninjoy_session::protocol::{HostMessage, PageMessage, decode_host, encode_page};
    use tokio_tungstenite::tungstenite::Message;
    let port = core.snapshot().addresses.plain_port;
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}/ws"))
        .await
        .expect("websocket connects");
    let mut buf = Vec::new();
    encode_page(&PageMessage::List { device: [7; 16] }, &mut buf);
    ws.send(Message::Binary(buf.into())).await.unwrap();
    loop {
        let message = tokio::time::timeout(Duration::from_secs(3), ws.next())
            .await
            .expect("an answer")
            .expect("open")
            .expect("valid");
        if let Message::Binary(bytes) = message
            && let Some(HostMessage::SlotList {
                phones_can_create, ..
            }) = decode_host(&bytes).unwrap()
        {
            return phones_can_create;
        }
    }
}

/// A port nothing listens on now.
fn free_port() -> u16 {
    std::net::TcpListener::bind(("0.0.0.0", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

fn custom(secure: u16, plain: u16) -> PortsSetting {
    PortsSetting {
        mode: PortsMode::Custom,
        secure,
        plain,
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn new_ports_move_the_servers_and_keep_the_controllers() {
    let core = start(&temp_dir()).await;
    core.create(Some(4)).unwrap();
    let (secure, plain) = (free_port(), free_port());
    let result = core
        .update_settings(Settings {
            ports: custom(secure, plain),
            ..core.settings()
        })
        .await
        .expect("the ports are free");
    assert!(result.ports_moved);
    let snap = core.snapshot();
    assert_eq!(snap.addresses.secure_port, Some(secure));
    assert_eq!(snap.addresses.plain_port, plain);
    assert_eq!(snap.settings.ports, custom(secure, plain));
    let numbers: Vec<u16> = snap.controllers.iter().map(|c| c.number).collect();
    assert_eq!(numbers, [4]);
    assert!(snap.controllers[0].url.contains(&format!(":{plain}/4")));
    assert_eq!(
        serde_json::to_value(&result).unwrap(),
        serde_json::json!({ "portsMoved": true })
    );

    // the same ports again, with another setting changed: nothing moves
    let result = core
        .update_settings(Settings {
            hold_seconds: 90,
            ..core.settings()
        })
        .await
        .unwrap();
    assert!(!result.ports_moved);
    assert_eq!(core.snapshot().addresses.plain_port, plain);
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn invalid_ports_change_nothing() {
    let core = start(&temp_dir()).await;
    let before = core.snapshot();
    let port = free_port();
    for ports in [custom(port, port), custom(0, port)] {
        let error = core
            .update_settings(Settings {
                ports,
                hold_seconds: 90,
                ..core.settings()
            })
            .await
            .expect_err("invalid ports are refused");
        assert!(!error.is_empty());
    }
    let after = core.snapshot();
    assert_eq!(after.settings, before.settings);
    assert_eq!(after.addresses.plain_port, before.addresses.plain_port);
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn a_taken_port_keeps_the_previous_ports_and_setting() {
    let dir = temp_dir();
    let core = start(&dir).await;
    let before = core.snapshot();
    let taken = std::net::TcpListener::bind(("0.0.0.0", 0)).unwrap();
    let port = taken.local_addr().unwrap().port();
    let error = core
        .update_settings(Settings {
            ports: custom(port, free_port()),
            ..core.settings()
        })
        .await
        .expect_err("the port is taken");
    assert!(error.starts_with(&format!("port {port}:")), "{error}");
    let after = core.snapshot();
    assert_eq!(after.settings.ports, PortsSetting::default());
    assert_eq!(after.addresses.plain_port, before.addresses.plain_port);
    assert_eq!(after.addresses.secure_port, before.addresses.secure_port);
    core.shutdown().await;

    let core = start(&dir).await;
    assert_eq!(core.settings().ports, PortsSetting::default(), "not saved");
    core.shutdown().await;
}
