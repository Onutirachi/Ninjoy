//! The hub with a recording backend and a real session (no phone needed: slots are created and
//! removed by the host, states are handed to the sink directly).

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use ninjoy_devices::ds4::Report;
use ninjoy_devices::{Backend, DeviceError, DeviceHub, OnFeedback, Pad, PadStatus, Unavailable};
use ninjoy_session::state::button;
use ninjoy_session::{ControllerState, Feedback, Session, SessionConfig, StateSink};

#[derive(Default)]
struct Log {
    plugs: Vec<u16>,
    unplugs: Vec<u16>,
    reports: HashMap<u16, Vec<Report>>,
    feedback: HashMap<u16, OnFeedback>,
}

/// Records every pad; slots in `fail` cannot be plugged.
#[derive(Clone, Default)]
struct Recording {
    log: Arc<Mutex<Log>>,
    fail: Vec<u16>,
}

struct RecordingPad {
    slot: u16,
    log: Arc<Mutex<Log>>,
}

impl Backend for Recording {
    fn name(&self) -> &'static str {
        "test"
    }
    fn plug(&self, slot: u16, feedback: OnFeedback) -> Result<Box<dyn Pad>, DeviceError> {
        if self.fail.contains(&slot) {
            return Err(DeviceError("no more pads".into()));
        }
        let mut log = self.log.lock().unwrap();
        log.plugs.push(slot);
        log.feedback.insert(slot, feedback);
        Ok(Box::new(RecordingPad {
            slot,
            log: self.log.clone(),
        }))
    }
}

impl Pad for RecordingPad {
    fn submit(&mut self, report: &Report) -> Result<(), DeviceError> {
        self.log
            .lock()
            .unwrap()
            .reports
            .entry(self.slot)
            .or_default()
            .push(*report);
        Ok(())
    }
}

impl Drop for RecordingPad {
    fn drop(&mut self) {
        self.log.lock().unwrap().unplugs.push(self.slot);
    }
}

static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

async fn session(hub: &DeviceHub) -> Session {
    let data_dir = std::env::temp_dir().join(format!(
        "ninjoy-devices-test-{}-{}",
        std::process::id(),
        NEXT_DIR.fetch_add(1, Ordering::Relaxed)
    ));
    let session = Session::start(
        SessionConfig {
            plain_ports: vec![0],
            secure_ports: vec![0],
            data_dir: Some(data_dir),
            announce: false,
            ..SessionConfig::default()
        },
        Arc::new(hub.clone()),
    )
    .await
    .expect("session starts");
    hub.attach(&session);
    session
}

async fn until(what: &str, mut check: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(2);
    while !check() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
}

fn pressed(bit: u32) -> ControllerState {
    ControllerState {
        buttons: 1 << bit,
        ..ControllerState::NEUTRAL
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn plugs_for_host_slots_and_first_states_and_unplugs_when_freed() {
    let backend = Recording::default();
    let log = backend.log.clone();
    let hub = DeviceHub::new(Ok(Box::new(backend)));
    let session = session(&hub).await;

    let waiting = session.create_slot();
    until("a pad for the waiting slot", || {
        log.lock().unwrap().plugs == [waiting]
    })
    .await;
    assert_eq!(hub.status(waiting), Some(PadStatus::Plugged));

    hub.on_state(7, &pressed(button::CROSS)); // a phone's first state
    assert_eq!(log.lock().unwrap().plugs, [waiting, 7]);
    let last = *log.lock().unwrap().reports[&7].last().unwrap();
    assert_eq!(last[5] & 0x20, 0x20, "cross reported at once");

    // the session releases everything on loss; the pad stays for the grace period
    hub.on_state(7, &ControllerState::NEUTRAL);
    assert_eq!(log.lock().unwrap().plugs, [waiting, 7], "same pad");
    assert_eq!(
        log.lock().unwrap().reports[&7].last().unwrap()[5],
        0x08,
        "released"
    );

    session.remove_slot(waiting).unwrap();
    until("the waiting slot's pad unplugged", || {
        log.lock().unwrap().unplugs == [waiting]
    })
    .await;
    assert_eq!(hub.status(waiting), None);
    hub.unplug_all();
    assert_eq!(log.lock().unwrap().unplugs, [waiting, 7]);
    session.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn reports_250_times_a_second_for_8_pads() {
    let backend = Recording::default();
    let log = backend.log.clone();
    let hub = DeviceHub::new(Ok(Box::new(backend)));
    for slot in 1..=8 {
        hub.on_state(slot, &pressed(button::R1));
    }
    let start: HashMap<u16, usize> = (1..=8)
        .map(|s| (s, log.lock().unwrap().reports[&s].len()))
        .collect();
    tokio::time::sleep(Duration::from_secs(2)).await;
    for slot in 1..=8 {
        let reports = &log.lock().unwrap().reports[&slot];
        let sent = reports.len() - start[&slot];
        assert!(
            (480..=520).contains(&sent),
            "slot {slot}: {sent} reports in 2 s"
        );
        assert_eq!(
            reports.last().unwrap()[6] & 0x02,
            0x02,
            "held input repeated"
        );
        let counters: Vec<u8> = reports[reports.len() - 3..]
            .iter()
            .map(|r| r[7] >> 2)
            .collect();
        assert_eq!(
            counters[1],
            (counters[0] + 1) & 0x3F,
            "counter advances on every report"
        );
    }
    hub.unplug_all();
}

#[tokio::test(flavor = "multi_thread")]
async fn adds_under_a_millisecond_per_state() {
    let hub = DeviceHub::new(Ok(Box::new(Recording::default())));
    hub.on_state(1, &ControllerState::NEUTRAL);
    let mut times: Vec<Duration> = (0..2000)
        .map(|i| {
            let state = pressed(if i % 2 == 0 {
                button::CROSS
            } else {
                button::CIRCLE
            });
            let t = Instant::now();
            hub.on_state(1, &state);
            t.elapsed()
        })
        .collect();
    times.sort();
    let p95 = times[times.len() * 95 / 100];
    assert!(p95 < Duration::from_millis(1), "p95 {p95:?}");
    hub.unplug_all();
}

#[tokio::test(flavor = "multi_thread")]
async fn a_failing_pad_affects_only_its_slot() {
    let backend = Recording {
        fail: vec![3],
        ..Recording::default()
    };
    let log = backend.log.clone();
    let hub = DeviceHub::new(Ok(Box::new(backend)));
    for slot in [2, 3, 4] {
        hub.on_state(slot, &ControllerState::NEUTRAL);
    }
    assert_eq!(log.lock().unwrap().plugs, [2, 4]);
    assert_eq!(
        hub.status(3),
        Some(PadStatus::Failed("no more pads".into()))
    );
    assert_eq!(hub.status(2), Some(PadStatus::Plugged));
    // not retried on every state
    hub.on_state(3, &ControllerState::NEUTRAL);
    assert_eq!(log.lock().unwrap().plugs, [2, 4]);
    hub.unplug_all();
}

#[tokio::test(flavor = "multi_thread")]
async fn sends_the_game_feedback_of_each_pad_to_its_slot() {
    let backend = Recording::default();
    let log = backend.log.clone();
    let hub = DeviceHub::new(Ok(Box::new(backend)));
    let session = session(&hub).await;
    let got = Arc::new(Mutex::new(Vec::new()));
    let sink = got.clone();
    hub.on_feedback(move |slot, f| sink.lock().unwrap().push((slot, f)));
    hub.on_state(1, &ControllerState::NEUTRAL);
    hub.on_state(2, &ControllerState::NEUTRAL);
    let rumble = Feedback {
        rumble: Some((1.0, 0.5)),
        lightbar: Some([0, 0, 255]),
    };
    let feedback = log.lock().unwrap().feedback[&2].clone();
    feedback(rumble);
    assert_eq!(*got.lock().unwrap(), [(2, rumble)]);
    hub.unplug_all();
    session.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn without_a_backend_the_session_runs_and_slots_say_why() {
    let reason = Unavailable {
        reason: "The ViGEmBus driver is not available".into(),
        fix: "Install ViGEmBus".into(),
    };
    let hub = DeviceHub::new(Err(reason.clone()));
    assert_eq!(hub.unavailable(), Some(&reason));
    assert_eq!(hub.backend_name(), None);
    let session = session(&hub).await;
    let slot = session.create_slot();
    until("the slot's status", || hub.status(slot).is_some()).await;
    assert_eq!(hub.status(slot), Some(PadStatus::Unavailable));
    hub.on_state(slot, &pressed(button::CROSS)); // ignored
    session.shutdown().await;
}
