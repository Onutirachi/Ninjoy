//! The skin library: listing, files, default, broken skins and the page's choice (skin format v2
//! T005).

mod common;

use std::collections::HashMap;
use std::path::PathBuf;

use common::{Page, device, eventually, start_host};
use ninjoy_session::SessionConfig;
use ninjoy_session::protocol::{HostMessage, PageMessage};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// GET over plain HTTP: (status, body).
async fn get(port: u16, path: &str) -> (u16, Vec<u8>) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    s.write_all(
        format!("GET {path} HTTP/1.1\r\nHost: test\r\nConnection: close\r\n\r\n").as_bytes(),
    )
    .await
    .unwrap();
    let mut raw = Vec::new();
    s.read_to_end(&mut raw).await.unwrap();
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    let head = String::from_utf8_lossy(&raw[..split]).to_string();
    let status = head.split(' ').nth(1).unwrap().parse().unwrap();
    let body = raw[split + 4..].to_vec();
    // chunked bodies are not used by these routes
    (status, body)
}

async fn index(port: u16) -> Value {
    let (status, body) = get(port, "/skins/index.json").await;
    assert_eq!(status, 200);
    serde_json::from_slice(&body).unwrap()
}

/// A folder with installed skins: a good one, a broken one, an unknown format and a bad name.
fn library() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "ninjoy-skins-test-{}-{}",
        std::process::id(),
        rand_suffix()
    ));
    let skin = |id: &str, json: &str| {
        std::fs::create_dir_all(dir.join(id).join("controls")).unwrap();
        std::fs::write(dir.join(id).join("skin.json"), json).unwrap();
        std::fs::write(dir.join(id).join("controls/a.svg"), "<svg/>").unwrap();
    };
    skin(
        "arcade",
        r#"{"format":2,"name":"Arcade","author":"Carlos","version":"1.0.0"}"#,
    );
    skin("broken", "{ not json");
    skin(
        "future",
        r#"{"format":9,"name":"Future","author":"x","version":"1.0.0"}"#,
    );
    skin(
        "Bad_Name",
        r#"{"format":2,"name":"Bad","author":"x","version":"1.0.0"}"#,
    );
    dir
}

fn rand_suffix() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
}

#[tokio::test]
async fn lists_the_official_and_installed_skins() {
    let host = start_host(SessionConfig {
        skins_dir: Some(library()),
        ..SessionConfig::default()
    })
    .await;
    let v = index(host.port).await;
    assert_eq!(v["default"], "ninjoy");
    let ids: Vec<&str> = v["skins"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["id"].as_str().unwrap())
        .collect();
    assert_eq!(
        ids,
        ["ninjoy", "arcade"],
        "broken, unknown formats and bad names are not offered"
    );
    let arcade = &v["skins"][1];
    assert_eq!(
        (arcade["name"].as_str(), arcade["format"].as_u64()),
        (Some("Arcade"), Some(2))
    );
    assert_eq!(
        arcade["files"],
        serde_json::json!(["controls/a.svg", "skin.json"])
    );
    assert_eq!(
        v["skins"][0]["preview"], "preview.png",
        "the official skin's preview"
    );

    let all = host.session.skins();
    let reason = |id: &str| {
        all.iter()
            .find(|e| e.id == id)
            .and_then(|e| e.broken.clone())
    };
    assert_eq!(
        reason("broken").as_deref(),
        Some("skin.json is not valid JSON")
    );
    assert!(reason("future").unwrap().contains("format 9"));
    assert!(all.iter().all(|e| e.id != "Bad_Name"));
    assert!(all[0].bundled && all[0].id == "ninjoy");
}

#[tokio::test]
async fn serves_skin_files_and_nothing_outside_them() {
    let host = start_host(SessionConfig {
        skins_dir: Some(library()),
        ..SessionConfig::default()
    })
    .await;
    assert_eq!(
        get(host.port, "/skins/arcade/controls/a.svg").await,
        (200, b"<svg/>".to_vec())
    );
    let (status, body) = get(host.port, "/skins/ninjoy/skin.json").await;
    assert_eq!(status, 200);
    assert!(String::from_utf8_lossy(&body).contains("\"name\""));
    for path in [
        "/skins/arcade/%2e%2e/broken/skin.json",
        "/skins/arcade/missing.svg",
        "/skins/Bad_Name/skin.json",
        "/skins/arcade/..%2fbroken%2fskin.json",
    ] {
        assert_eq!(get(host.port, path).await.0, 404, "{path}");
    }
}

#[tokio::test]
async fn the_default_and_broken_skins_reach_open_pages() {
    let host = start_host(SessionConfig {
        skins_dir: Some(library()),
        ..SessionConfig::default()
    })
    .await;
    let (mut page, _) = Page::join(host.port, 0, device(1)).await;

    host.session.set_default_skin("arcade");
    assert_eq!(page.recv().await, Some(HostMessage::SkinsChanged));
    assert_eq!(index(host.port).await["default"], "arcade");

    host.session.set_broken_skins(HashMap::from([(
        "arcade".to_owned(),
        "missing touch area".to_owned(),
    )]));
    assert_eq!(page.recv().await, Some(HostMessage::SkinsChanged));
    let v = index(host.port).await;
    assert_eq!(
        v["default"], "ninjoy",
        "a broken default falls back to the official skin"
    );
    assert_eq!(v["skins"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn records_the_skin_each_phone_uses() {
    let host = start_host(SessionConfig::default()).await;
    let (mut page, slot) = Page::join(host.port, 0, device(2)).await;
    page.send(PageMessage::Skin {
        id: "arcade".into(),
    })
    .await;
    eventually("the slot's skin", || {
        host.session
            .slots()
            .iter()
            .any(|s| s.number == slot && s.skin.as_deref() == Some("arcade"))
    })
    .await;
}
