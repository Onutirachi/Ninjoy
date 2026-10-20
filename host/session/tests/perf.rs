//! SC-002 / SC-007: 32 controllers × 120 states per second; every state reaches the sink fast.
//!
//! Ignored by default (it runs for 10 s). Run in release:
//! `cargo test --release -p ninjoy-session --test perf -- --ignored --nocapture`

mod common;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use common::{Page, device};
use ninjoy_session::{ControllerState, Session, SessionConfig, StateSink};

/// Records when each state arrived; the state's button field carries the sender's counter.
struct TimingSink(Mutex<Vec<(u16, u32, Instant)>>);

impl StateSink for TimingSink {
    fn on_state(&self, slot: u16, state: &ControllerState) {
        self.0
            .lock()
            .unwrap()
            .push((slot, state.buttons, Instant::now()));
    }
}

const CLIENTS: u8 = 32;
const RATE: u32 = 120;
const SECONDS: u32 = 10;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "10 s load test; run with --ignored in release"]
async fn perf_32_clients_at_120_states_per_second() {
    let sink = Arc::new(TimingSink(Mutex::new(Vec::with_capacity(50_000))));
    let session = Session::start(
        SessionConfig {
            plain_ports: vec![0],
            secure_ports: vec![],
            announce: false,
            ..SessionConfig::default()
        },
        sink.clone(),
    )
    .await
    .unwrap();
    let port = session.addresses().plain_port;

    let mut clients = Vec::new();
    for n in 0..CLIENTS {
        clients.push(tokio::spawn(async move {
            let (mut page, slot) = Page::join(port, 0, device(n + 1)).await;
            let mut sent = Vec::with_capacity((RATE * SECONDS) as usize);
            let mut tick = tokio::time::interval(Duration::from_secs(1) / RATE);
            for i in 1..=RATE * SECONDS {
                tick.tick().await;
                sent.push(Instant::now());
                page.state(ControllerState {
                    buttons: i,
                    ..ControllerState::NEUTRAL
                })
                .await;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
            (slot, sent)
        }));
    }
    let mut sent_by_slot = std::collections::HashMap::new();
    for c in clients {
        let (slot, sent) = c.await.unwrap();
        sent_by_slot.insert(slot, sent);
    }

    let received = sink.0.lock().unwrap();
    let mut delays: Vec<Duration> = received
        .iter()
        .filter(|(_, i, _)| *i > 0)
        .map(|(slot, i, at)| at.duration_since(sent_by_slot[slot][(*i - 1) as usize]))
        .collect();
    delays.sort();
    let expected = (CLIENTS as u32 * RATE * SECONDS) as usize;
    let p = |q: f64| delays[((delays.len() as f64 * q) as usize).min(delays.len() - 1)];
    println!(
        "{} states received of {expected}; send→sink p50 {:?}, p95 {:?}, p99 {:?}, max {:?}",
        delays.len(),
        p(0.50),
        p(0.95),
        p(0.99),
        delays.last().unwrap()
    );
    assert_eq!(delays.len(), expected, "every state reached the sink");
    assert!(
        p(0.95) < Duration::from_millis(1),
        "p95 under 1 ms (includes local network)"
    );
}
