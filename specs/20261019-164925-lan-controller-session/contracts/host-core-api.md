# Contract: Host Session Core API (`ninjoy-session`)

The Rust library the desktop app and the device backends will use. Signatures are
indicative; names and semantics are the contract.

```rust
pub struct SessionConfig {
    pub secure_port: u16,          // default 443, falls back to 8443
    pub plain_port: u16,           // default 80, falls back to 8080
    pub grace: Duration,           // default 60 s
    pub loss_timeout: Duration,    // default 1 s
    pub local_name: String,        // default "ninjoy" → ninjoy.local
    pub data_dir: PathBuf,         // certificate location; default: app data dir
    pub web_root: Option<PathBuf>, // serve the page from disk instead of the embedded copy
}

pub trait StateSink: Send + Sync + 'static {
    /// Called on the connection task for every accepted state and for neutral states
    /// (loss, hidden, kick). Must not block.
    fn on_state(&self, slot: u16, state: &ControllerState);
}

pub struct Session { /* … */ }

impl Session {
    pub async fn start(config: SessionConfig, sink: Arc<dyn StateSink>) -> Result<Session, StartError>;
    pub fn addresses(&self) -> Addresses;          // local name, IPs, ports actually bound
    pub fn slots(&self) -> Vec<SlotInfo>;           // snapshot, sorted by number
    pub fn create_slot(&self) -> u16;               // lowest free number, waiting for a device
    pub fn remove_slot(&self, slot: u16) -> Result<(), SlotError>; // only waiting slots
    pub fn kick(&self, slot: u16) -> Result<(), SlotError>;
    pub fn send_feedback(&self, slot: u16, feedback: Feedback); // ignored if not connected
    pub fn events(&self) -> broadcast::Receiver<SessionEvent>;
    pub async fn shutdown(self);
}

pub struct SlotInfo {
    pub number: u16,
    pub status: SlotStatus,               // Waiting | Connected | Held { until: Instant }
    pub device: Option<DeviceSummary>,    // "Galaxy S23", "Chrome", from the User-Agent
    pub connected_since: Option<SystemTime>,
    pub last_state: Option<ControllerState>,
    pub rtt: Option<Duration>,
}

pub enum SessionEvent {
    SlotCreated(u16),
    Connected { slot: u16, device: DeviceSummary },
    Reconnected { slot: u16 },
    Disconnected { slot: u16 },           // loss or close; slot held for the grace period
    Freed { slot: u16 },
    Kicked { slot: u16 },
}

pub struct Feedback {
    pub rumble: Option<(f32, f32)>,       // strong, weak 0…1
    pub lightbar: Option<[u8; 3]>,
}

pub struct ControllerState {              // decoded STATE, see protocol.md
    pub buttons: u32,                     // DS4 order bitmask
    pub sticks: [i16; 4],                 // lx, ly, rx, ry
    pub triggers: [u8; 2],                // l2, r2
    pub gyro: bool,
    pub touchpad_click: bool,             // = buttons bit 17, kept for clarity
    pub touches: [Option<Touch>; 2],
    pub motion: Option<Motion>,           // rate °/s, accel m/s², controller frame
}
// ControllerState::NEUTRAL: everything released, sticks centered, no touches, no motion.
```

## Guarantees

- `on_state` is never called concurrently for the same slot.
- After `Disconnected`, `Kicked` or HIDDEN, the sink has already received `NEUTRAL` for that
  slot.
- A slot number is never assigned to two devices at once.
- Slot numbers are reused only after `Freed`.
- No method blocks on network I/O; `slots()` and `create_slot()` take a short lock.
