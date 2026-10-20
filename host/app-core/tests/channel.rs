//! The local command channel and the command line (desktop app T004).

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use ninjoy_app_core::channel::{self, ChannelError};
use ninjoy_app_core::{AppCore, CoreConfig, cli};
use ninjoy_devices::Unavailable;
use ninjoy_session::SessionConfig;

static NEXT: AtomicUsize = AtomicUsize::new(0);

fn unique(what: &str) -> String {
    format!(
        "ninjoy-test-{what}-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}

async fn core() -> Arc<AppCore> {
    let dir: PathBuf = std::env::temp_dir().join(unique("dir"));
    AppCore::start(CoreConfig {
        data_dir: dir,
        session: SessionConfig {
            plain_ports: vec![0],
            secure_ports: vec![0],
            announce: false,
            ..SessionConfig::default()
        },
        backend: Err(Unavailable {
            reason: "tests".into(),
            fix: String::new(),
        }),
    })
    .await
    .unwrap()
}

/// Sends from a blocking thread, like the command line does.
async fn send(name: &str, request: &str) -> Result<(bool, String), ChannelError> {
    let (name, request) = (name.to_string(), request.to_string());
    tokio::task::spawn_blocking(move || channel::send(&name, &request))
        .await
        .unwrap()
}

#[tokio::test(flavor = "multi_thread")]
async fn answers_commands_from_the_command_line() {
    let core = core().await;
    let name = unique("channel");
    let shown = Arc::new(AtomicUsize::new(0));
    let count = shown.clone();
    channel::serve(&name, core.clone(), move || {
        count.fetch_add(1, Ordering::Relaxed);
    })
    .expect("channel listens");

    let (ok, text) = send(&name, "create 4").await.unwrap();
    assert!(ok, "{text}");
    assert!(text.starts_with("controller 4 created"), "{text}");
    assert_eq!(core.snapshot().controllers[0].number, 4);

    let (ok, text) = send(&name, "create 4").await.unwrap();
    assert!(!ok);
    assert_eq!(text, "controller 4 already exists");

    let (ok, text) = send(&name, "list").await.unwrap();
    assert!(ok);
    assert!(
        text.lines().next().unwrap().starts_with("4  waiting"),
        "{text}"
    );

    assert_eq!(
        send(&name, "kick 9").await.unwrap(),
        (false, "there is no controller 9".into())
    );
    assert_eq!(
        send(&name, "remove 4").await.unwrap(),
        (true, "controller 4 removed".into())
    );
    assert!(core.snapshot().controllers.is_empty());

    assert_eq!(send(&name, "show").await.unwrap().0, true);
    assert_eq!(shown.load(Ordering::Relaxed), 1);
    assert!(!send(&name, "dance").await.unwrap().0);
}

#[tokio::test(flavor = "multi_thread")]
async fn only_one_copy_listens() {
    let core = core().await;
    let name = unique("single");
    channel::serve(&name, core.clone(), || {}).expect("first copy listens");
    assert!(matches!(
        channel::serve(&name, core.clone(), || {}),
        Err(ChannelError::AlreadyRunning)
    ));
}

#[test]
fn says_when_ninjoy_is_not_running() {
    assert!(matches!(
        channel::send(&unique("nobody"), "list"),
        Err(ChannelError::NotRunning)
    ));
}

#[tokio::test(flavor = "multi_thread")]
async fn the_command_line_prints_and_returns_an_exit_code() {
    let core = core().await;
    let name = unique("cli");
    channel::serve(&name, core.clone(), || {}).unwrap();
    let run = |args: &[&str]| {
        let (name, args) = (
            name.clone(),
            args.iter().map(|a| a.to_string()).collect::<Vec<_>>(),
        );
        tokio::task::spawn_blocking(move || {
            let mut out = Vec::new();
            let code = cli::run_with(&name, &args, &mut out);
            (code, String::from_utf8(out).unwrap())
        })
    };
    assert_eq!(run(&["create"]).await.unwrap().0, Some(0));
    assert_eq!(run(&["remove", "8"]).await.unwrap().0, Some(1));
    let (code, out) = run(&["remove"]).await.unwrap();
    assert_eq!(code, Some(2), "usage error");
    assert!(out.contains("usage"), "{out}");
    assert_eq!(
        run(&["--tray"]).await.unwrap().0,
        None,
        "not a command: start the app"
    );
    assert_eq!(run(&[]).await.unwrap().0, None);
    let mut out = Vec::new();
    assert_eq!(
        cli::run_with(&unique("nobody"), &["list".into()], &mut out),
        Some(1)
    );
    assert!(
        String::from_utf8(out)
            .unwrap()
            .contains("Ninjoy is not running")
    );
}
