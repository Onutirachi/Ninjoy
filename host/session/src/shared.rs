//! State shared by the session API, the connections and the background tasks.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use tokio::sync::{broadcast, mpsc, watch};

use crate::device::DeviceSummary;
use crate::protocol::HostMessage;
use crate::slots::{ConnId, SlotTable};
use crate::state::ControllerState;

/// Receives every decoded controller state; the virtual device backend implements it.
pub trait StateSink: Send + Sync + 'static {
    /// Called on the connection task for every accepted state and for neutral states (loss,
    /// hidden page, kick). Never called concurrently for the same slot. Must not block.
    fn on_state(&self, slot: u16, state: &ControllerState);
}

/// What happened to a slot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SessionEvent {
    SlotCreated(u16),
    Connected {
        slot: u16,
        device: DeviceSummary,
    },
    Reconnected {
        slot: u16,
    },
    /// the device dropped; the slot is held for the grace period
    Disconnected {
        slot: u16,
    },
    Freed {
        slot: u16,
    },
    Kicked {
        slot: u16,
    },
}

/// Rumble and lightbar for one slot.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Feedback {
    /// strong, weak motor (0…1)
    pub rumble: Option<(f32, f32)>,
    pub lightbar: Option<[u8; 3]>,
}

impl Feedback {
    pub(crate) fn to_message(self) -> HostMessage {
        let unit = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
        HostMessage::Feedback {
            rumble: self.rumble.map(|(s, w)| [unit(s), unit(w)]),
            lightbar: self.lightbar,
        }
    }
}

/// Orders sent to a connection task.
#[derive(Debug)]
pub(crate) enum Control {
    Send(HostMessage),
    /// the player was kicked: tell them and close
    Kick,
    /// the same device opened the slot elsewhere: tell this one and close
    Replaced,
}

/// Per-slot data written by the owning connection. The lock also serializes sink calls.
#[derive(Debug, Default)]
pub(crate) struct Live {
    pub owner: ConnId,
    pub last_state: Option<ControllerState>,
    pub rtt: Option<Duration>,
    /// the skin the page says it uses ("" = the default)
    pub skin: Option<String>,
}

pub(crate) struct Shared {
    pub table: Mutex<SlotTable>,
    pub live: Mutex<HashMap<u16, Arc<Mutex<Live>>>>,
    pub conns: Mutex<HashMap<ConnId, mpsc::Sender<Control>>>,
    pub sink: Arc<dyn StateSink>,
    pub events: broadcast::Sender<SessionEvent>,
    /// table version, so listing pages refresh on changes
    pub list_version: watch::Sender<u64>,
    pub next_conn: AtomicU64,
    /// how long a dropped device's slot is held, in ms (changed at run time by the app)
    pub grace_ms: AtomicU64,
    pub loss_timeout: Duration,
    pub skins: crate::skins::Library,
}

/// Locks a mutex, ignoring poisoning (a panicked task must not take the session down).
pub(crate) fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Shared {
    pub fn new(
        sink: Arc<dyn StateSink>,
        grace: Duration,
        loss_timeout: Duration,
        skins_dir: Option<std::path::PathBuf>,
    ) -> Self {
        Self {
            table: Mutex::new(SlotTable::new()),
            live: Mutex::new(HashMap::new()),
            conns: Mutex::new(HashMap::new()),
            sink,
            events: broadcast::channel(256).0,
            list_version: watch::channel(0).0,
            next_conn: AtomicU64::new(1),
            grace_ms: AtomicU64::new(grace.as_millis() as u64),
            loss_timeout,
            skins: crate::skins::Library::new(skins_dir),
        }
    }

    pub fn grace(&self) -> Duration {
        Duration::from_millis(self.grace_ms.load(Ordering::Relaxed))
    }

    pub fn next_conn(&self) -> ConnId {
        self.next_conn.fetch_add(1, Ordering::Relaxed)
    }

    /// Runs `f` on the slot table and tells listing pages when something changed.
    pub fn with_table<R>(&self, f: impl FnOnce(&mut SlotTable) -> R) -> R {
        let (result, version) = {
            let mut table = lock(&self.table);
            let result = f(&mut table);
            (result, table.version())
        };
        self.list_version.send_if_modified(|v| {
            let changed = *v != version;
            *v = version;
            changed
        });
        result
    }

    pub fn emit(&self, event: SessionEvent) {
        tracing::info!(?event, "session event");
        let _ = self.events.send(event); // no listener is fine
    }

    pub fn live(&self, slot: u16) -> Arc<Mutex<Live>> {
        lock(&self.live).entry(slot).or_default().clone()
    }

    pub fn drop_live(&self, slot: u16) {
        lock(&self.live).remove(&slot);
    }

    /// Tells every open page that the skin library or the default skin changed.
    pub fn skins_changed(&self) {
        for tx in lock(&self.conns).values() {
            let _ = tx.try_send(Control::Send(HostMessage::SkinsChanged));
        }
    }

    pub fn control(&self, conn: ConnId, control: Control) {
        if let Some(tx) = lock(&self.conns).get(&conn) {
            let _ = tx.try_send(control); // a full queue means the page is gone or stuck
        }
    }

    /// Hands `state` to the sink if `conn` still owns `slot`.
    pub fn deliver(
        &self,
        slot: u16,
        conn: ConnId,
        live: &Mutex<Live>,
        state: &ControllerState,
    ) -> bool {
        let mut live = lock(live);
        if live.owner != conn {
            return false;
        }
        self.sink.on_state(slot, state);
        live.last_state = Some(*state);
        true
    }

    /// Releases every input of `slot` regardless of the connection (kick, removal).
    pub fn neutralize(&self, slot: u16) {
        if let Some(live) = lock(&self.live).get(&slot).cloned() {
            let mut live = lock(&live);
            let neutral = live
                .last_state
                .map(|s| s.released())
                .unwrap_or(ControllerState::NEUTRAL);
            self.sink.on_state(slot, &neutral);
            live.last_state = Some(neutral);
            live.owner = 0;
        }
    }
}
