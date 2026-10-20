//! The app core without a window: controllers, saved state and settings (desktop app T002).

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use ninjoy_app_core::{AppCore, CoreConfig, CoreError, Settings, Theme};
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
    let changed = Settings {
        theme: Theme::Dark,
        hold_seconds: 120,
        phones_can_create: false,
        start_with_system: true,
        ..defaults
    };
    core.update_settings(changed.clone());
    assert_eq!(core.snapshot().settings, changed);
    core.shutdown().await;

    let core = start(&dir).await;
    assert_eq!(core.settings(), changed);
    core.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn clamps_the_hold_time() {
    let core = start(&temp_dir()).await;
    core.update_settings(Settings {
        hold_seconds: 5,
        ..Settings::default()
    });
    assert_eq!(core.settings().hold_seconds, 10);
    core.update_settings(Settings {
        hold_seconds: 9000,
        ..Settings::default()
    });
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
