//! Connects the session to a backend: one virtual pad per slot, a steady report rate and the
//! game's feedback back to the phones.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::{Duration, Instant};

use ninjoy_session::{ControllerState, Feedback, FeedbackHandle, Session, SessionEvent, StateSink};
use tokio::sync::broadcast::error::RecvError;

use crate::backend::{Backend, OnFeedback, Pad, Unavailable};
use crate::ds4::Ds4Pad;

/// Reports are resent at 250 Hz, like a real DualShock 4 over USB.
pub const REPORT_INTERVAL: Duration = Duration::from_millis(4);

/// The virtual pad of a slot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PadStatus {
    Plugged,
    /// plugging or updating failed; retried on the slot's next state
    Failed(String),
    /// no backend on this computer (see [`DeviceHub::unavailable`])
    Unavailable,
}

struct Entry {
    pad: Option<Box<dyn Pad>>,
    ds4: Ds4Pad,
    state: ControllerState,
    status: PadStatus,
    /// after a failure, plugging is retried no sooner than this
    retry_at: Option<Instant>,
}

/// Wait between attempts to plug a pad that failed.
const RETRY: Duration = Duration::from_secs(1);

/// A developer tool's view of every feedback (see [`DeviceHub::on_feedback`]).
type ToolFeedback = Arc<dyn Fn(u16, Feedback) + Send + Sync>;

struct Inner {
    backend: Option<Box<dyn Backend>>,
    unavailable: Option<Unavailable>,
    pads: Mutex<HashMap<u16, Entry>>,
    feedback: Mutex<Option<FeedbackHandle>>,
    /// feedback received per slot is printed by tools when set
    on_feedback: Mutex<Option<ToolFeedback>>,
    started: Instant,
}

/// Implements the session's [`StateSink`]: create it, pass it to [`Session::start`], then
/// [`attach`](DeviceHub::attach) the session.
#[derive(Clone)]
pub struct DeviceHub {
    inner: Arc<Inner>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl DeviceHub {
    /// A hub over `backend`, or without pads when no backend works here (the session still runs).
    pub fn new(backend: Result<Box<dyn Backend>, Unavailable>) -> Self {
        let (backend, unavailable) = match backend {
            Ok(b) => (Some(b), None),
            Err(u) => (None, Some(u)),
        };
        let hub = Self {
            inner: Arc::new(Inner {
                backend,
                unavailable,
                pads: Mutex::new(HashMap::new()),
                feedback: Mutex::new(None),
                on_feedback: Mutex::new(None),
                started: Instant::now(),
            }),
        };
        if hub.inner.backend.is_some() {
            let weak = Arc::downgrade(&hub.inner);
            std::thread::Builder::new()
                .name("ninjoy-pads".into())
                .spawn(move || pump(weak))
                .expect("pump thread starts");
        }
        hub
    }

    /// The backend in use ("ViGEmBus", "UHID"), if any.
    pub fn backend_name(&self) -> Option<&'static str> {
        self.inner.backend.as_ref().map(|b| b.name())
    }

    /// Why there are no virtual pads on this computer, if so.
    pub fn unavailable(&self) -> Option<&Unavailable> {
        self.inner.unavailable.as_ref()
    }

    /// Follows the session: plugs a pad for host-created slots, unplugs freed slots and sends
    /// the game's feedback to the phones. Call inside the tokio runtime.
    pub fn attach(&self, session: &Session) {
        *lock(&self.inner.feedback) = Some(session.feedback_handle());
        let mut events = session.events();
        let weak = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            loop {
                let event = match events.recv().await {
                    Ok(event) => event,
                    Err(RecvError::Lagged(_)) => continue,
                    Err(RecvError::Closed) => break,
                };
                let Some(inner) = weak.upgrade() else { break };
                match event {
                    SessionEvent::SlotCreated(slot) => {
                        let mut pads = lock(&inner.pads);
                        ensure(&inner, &mut pads, slot);
                    }
                    SessionEvent::Freed { slot }
                        if lock(&inner.pads)
                            .remove(&slot)
                            .is_some_and(|e| e.pad.is_some()) =>
                    {
                        tracing::info!(slot, "virtual DualShock 4 unplugged");
                    }
                    _ => {}
                }
            }
        });
    }

    /// Also hands every feedback the game sends to `f` (developer tools).
    pub fn on_feedback(&self, f: impl Fn(u16, Feedback) + Send + Sync + 'static) {
        *lock(&self.inner.on_feedback) = Some(Arc::new(f));
    }

    pub fn status(&self, slot: u16) -> Option<PadStatus> {
        lock(&self.inner.pads).get(&slot).map(|e| e.status.clone())
    }

    /// Unplugs every pad (host shutdown).
    pub fn unplug_all(&self) {
        lock(&self.inner.pads).clear();
    }
}

/// The slot's entry, plugging its pad when there is none yet.
fn ensure<'a>(inner: &Arc<Inner>, pads: &'a mut HashMap<u16, Entry>, slot: u16) -> &'a mut Entry {
    let entry = pads.entry(slot).or_insert_with(|| Entry {
        pad: None,
        ds4: Ds4Pad::new(),
        state: ControllerState::NEUTRAL,
        status: PadStatus::Unavailable,
        retry_at: None,
    });
    if entry.pad.is_none()
        && entry.retry_at.is_none_or(|at| Instant::now() >= at)
        && let Some(backend) = &inner.backend
    {
        let weak = Arc::downgrade(inner);
        let feedback: OnFeedback = Arc::new(move |f: Feedback| {
            let Some(inner) = weak.upgrade() else { return };
            if let Some(handle) = lock(&inner.feedback).as_ref() {
                handle.send(slot, f);
            }
            if let Some(tool) = lock(&inner.on_feedback).clone() {
                tool(slot, f);
            }
        });
        match backend.plug(slot, feedback) {
            Ok(pad) => {
                tracing::info!(
                    slot,
                    backend = backend.name(),
                    "virtual DualShock 4 plugged"
                );
                entry.pad = Some(pad);
                entry.status = PadStatus::Plugged;
                entry.retry_at = None;
            }
            Err(error) => {
                if entry.status != PadStatus::Failed(error.0.clone()) {
                    tracing::warn!(slot, %error, "could not plug a virtual DualShock 4");
                }
                entry.status = PadStatus::Failed(error.0);
                entry.retry_at = Some(Instant::now() + RETRY);
            }
        }
    }
    entry
}

/// Builds and sends the entry's current report; a failure unplugs it (retried on the next state).
fn send(entry: &mut Entry, slot: u16, now_us: u64) {
    let Some(pad) = entry.pad.as_mut() else {
        return;
    };
    let report = entry.ds4.report(&entry.state, now_us);
    if let Err(error) = pad.submit(&report) {
        tracing::warn!(slot, %error, "virtual DualShock 4 update failed");
        entry.pad = None;
        entry.status = PadStatus::Failed(error.0);
        entry.retry_at = Some(Instant::now() + RETRY);
    }
}

impl StateSink for DeviceHub {
    fn on_state(&self, slot: u16, state: &ControllerState) {
        let inner = &self.inner;
        if inner.backend.is_none() {
            return;
        }
        let now_us = inner.started.elapsed().as_micros() as u64;
        let mut pads = lock(&inner.pads);
        let entry = ensure(inner, &mut pads, slot);
        entry.state = *state;
        send(entry, slot, now_us);
    }
}

/// Resends every pad's report each [`REPORT_INTERVAL`] until the hub is dropped.
fn pump(weak: Weak<Inner>) {
    let mut next = Instant::now();
    loop {
        next += REPORT_INTERVAL;
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else {
            // late (system busy): skip the missed ticks instead of bursting
            next = now;
        }
        let Some(inner) = weak.upgrade() else { return };
        let now_us = inner.started.elapsed().as_micros() as u64;
        let mut pads = lock(&inner.pads);
        for (slot, entry) in pads.iter_mut() {
            send(entry, *slot, now_us);
        }
    }
}
