//! Helpers for the integration tests: a recording sink and a WebSocket page client.
#![allow(dead_code)]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use ninjoy_session::protocol::{DeviceId, HostMessage, PageMessage, decode_host, encode_page};
use ninjoy_session::{ControllerState, Session, SessionConfig, SessionEvent, StateSink};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

pub const ANDROID: &str = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

#[derive(Default)]
pub struct RecordingSink(pub Mutex<Vec<(u16, ControllerState)>>);

impl StateSink for RecordingSink {
    fn on_state(&self, slot: u16, state: &ControllerState) {
        self.0.lock().unwrap().push((slot, *state));
    }
}

impl RecordingSink {
    pub fn states(&self, slot: u16) -> Vec<ControllerState> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .filter(|(s, _)| *s == slot)
            .map(|(_, st)| *st)
            .collect()
    }
}

pub struct Host {
    pub session: Session,
    pub sink: Arc<RecordingSink>,
    pub port: u16,
}

pub async fn start_host(config: SessionConfig) -> Host {
    let sink = Arc::new(RecordingSink::default());
    // random ports and a private certificate folder per test
    let data_dir = std::env::temp_dir().join(format!(
        "ninjoy-test-{}-{}",
        std::process::id(),
        NEXT_DIR.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let session = Session::start(
        SessionConfig {
            plain_ports: vec![0],
            secure_ports: vec![0],
            data_dir: Some(data_dir),
            ..config
        },
        sink.clone(),
    )
    .await
    .expect("session starts");
    let port = session.addresses().plain_port;
    Host {
        session,
        sink,
        port,
    }
}

static NEXT_DIR: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

pub fn device(n: u8) -> DeviceId {
    [n; 16]
}

pub fn state(buttons: u32) -> ControllerState {
    ControllerState {
        buttons,
        ..ControllerState::NEUTRAL
    }
}

pub struct Page {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    buf: Vec<u8>,
    pub seq: u32,
}

impl Page {
    pub async fn connect(port: u16) -> Page {
        let mut request = format!("ws://127.0.0.1:{port}/ws")
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert("user-agent", ANDROID.parse().unwrap());
        let (ws, _) = connect_async(request).await.expect("websocket connects");
        Page {
            ws,
            buf: Vec::new(),
            seq: 0,
        }
    }

    pub async fn send(&mut self, message: PageMessage) {
        encode_page(&message, &mut self.buf);
        self.ws
            .send(Message::Binary(self.buf.clone().into()))
            .await
            .expect("send");
    }

    pub async fn hello(&mut self, slot: u16, device: DeviceId) {
        self.send(PageMessage::Hello {
            version: 1,
            slot,
            device,
        })
        .await;
    }

    pub async fn state(&mut self, state: ControllerState) {
        self.seq += 1;
        self.send(PageMessage::State {
            seq: self.seq,
            state,
        })
        .await;
    }

    /// Next protocol message, pings included.
    pub async fn recv_any(&mut self) -> Option<HostMessage> {
        loop {
            match tokio::time::timeout(Duration::from_secs(5), self.ws.next())
                .await
                .expect("host answers in time")
            {
                Some(Ok(Message::Binary(bytes))) => {
                    if let Some(message) = decode_host(&bytes).expect("valid host message") {
                        return Some(message);
                    }
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return None,
                Some(Ok(_)) => {}
            }
        }
    }

    /// Next protocol message, skipping pings. None when the host closed the connection.
    pub async fn recv(&mut self) -> Option<HostMessage> {
        loop {
            match tokio::time::timeout(Duration::from_secs(5), self.ws.next())
                .await
                .expect("host answers in time")
            {
                Some(Ok(Message::Binary(bytes))) => {
                    match decode_host(&bytes).expect("valid host message") {
                        Some(HostMessage::Ping { .. }) => continue,
                        Some(message) => return Some(message),
                        None => continue,
                    }
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return None,
                Some(Ok(_)) => continue,
            }
        }
    }

    pub async fn join(port: u16, slot: u16, device: DeviceId) -> (Page, u16) {
        let mut page = Page::connect(port).await;
        page.hello(slot, device).await;
        match page.recv().await {
            Some(HostMessage::Welcome { slot, .. }) => (page, slot),
            other => panic!("expected WELCOME, got {other:?}"),
        }
    }

    pub async fn close(mut self) {
        let _ = self.ws.close(None).await;
    }
}

/// Waits until `check` holds (polling), failing after 3 s.
pub async fn eventually(what: &str, mut check: impl FnMut() -> bool) {
    for _ in 0..300 {
        if check() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("timed out waiting for: {what}");
}

/// Next event matching `pred`, failing after 3 s.
pub async fn event(
    rx: &mut tokio::sync::broadcast::Receiver<SessionEvent>,
    pred: impl Fn(&SessionEvent) -> bool,
) -> SessionEvent {
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let e = rx.recv().await.expect("event channel open");
            if pred(&e) {
                return e;
            }
        }
    })
    .await
    .expect("event in time")
}
