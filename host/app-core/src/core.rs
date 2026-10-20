//! The app without its window: runs the session and the virtual pads, creates and removes
//! controllers, keeps settings, and describes everything for the window and the command line.

use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, UNIX_EPOCH};

use tokio::time::Instant;

use ninjoy_devices::{Backend, DeviceHub, PadStatus, Unavailable};
use ninjoy_session::slots::{SlotError, SlotStatus};
use ninjoy_session::{ControllerState, Feedback, Session, SessionConfig, StateSink};
use serde::Serialize;
use tokio::sync::broadcast;

use crate::store::{Settings, Store};

pub struct CoreConfig {
    /// where `app.json` (and the session's certificate, unless set) live
    pub data_dir: PathBuf,
    pub session: SessionConfig,
    pub backend: Result<Box<dyn Backend>, Unavailable>,
}

impl CoreConfig {
    /// The user's data folder, default ports and the platform's virtual controller backend.
    pub fn for_user() -> Self {
        Self {
            data_dir: directories::ProjectDirs::from("", "", "Ninjoy")
                .map(|d| d.data_dir().to_path_buf())
                .unwrap_or_else(|| PathBuf::from("ninjoy-data")),
            session: SessionConfig::default(),
            backend: ninjoy_devices::open_default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CoreError {
    NotFound(u16),
    Taken(u16),
    Invalid,
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoreError::NotFound(n) => write!(f, "there is no controller {n}"),
            CoreError::Taken(n) => write!(f, "controller {n} already exists"),
            CoreError::Invalid => f.write_str("controller numbers start at 1"),
        }
    }
}

impl std::error::Error for CoreError {}

fn slot_error(number: u16, e: SlotError) -> CoreError {
    match e {
        SlotError::Taken => CoreError::Taken(number),
        SlotError::Invalid => CoreError::Invalid,
        SlotError::NotFound | SlotError::NotWaiting => CoreError::NotFound(number),
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub addresses: AddressesView,
    pub driver: DriverView,
    pub settings: Settings,
    pub controllers: Vec<ControllerView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressesView {
    pub name: Option<String>,
    pub ips: Vec<String>,
    pub secure_port: Option<u16>,
    pub plain_port: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverView {
    pub ok: bool,
    pub backend: Option<String>,
    pub reason: Option<String>,
    pub fix: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerView {
    pub number: u16,
    /// "waiting", "connected" or "reconnecting"
    pub status: String,
    /// seconds left while reconnecting
    pub hold_left: Option<u64>,
    pub device: Option<String>,
    /// unix time in ms
    pub connected_since: Option<u64>,
    pub rtt_ms: Option<f64>,
    /// "plugged", "failed" or "unavailable"
    pub pad: String,
    pub pad_error: Option<String>,
    pub gyro: bool,
    pub lightbar: Option<[u8; 3]>,
    /// strong, weak (0–1) as the game last sent
    pub rumble: Option<[f32; 2]>,
    /// the address phones open (the QR code)
    pub url: String,
    /// the same by name (ninjoy.local/N)
    pub name_url: Option<String>,
}

/// The selected controller's inputs for the live view.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveView {
    pub buttons: u32,
    pub sticks: [i16; 4],
    pub triggers: [u8; 2],
    pub gyro: bool,
    pub touches: Vec<[u16; 3]>,
    pub rate: Option<[f32; 3]>,
    pub accel: Option<[f32; 3]>,
}

impl From<&ControllerState> for LiveView {
    fn from(s: &ControllerState) -> Self {
        Self {
            buttons: s.buttons,
            sticks: s.sticks,
            triggers: s.triggers,
            gyro: s.gyro,
            touches: s
                .touches
                .iter()
                .flatten()
                .map(|t| [u16::from(t.id), t.x, t.y])
                .collect(),
            rate: s.motion.map(|m| m.rate),
            accel: s.motion.map(|m| m.accel),
        }
    }
}

/// Feeds the virtual pads (the session's sink) and keeps each slot's last feedback.
struct Sink {
    hub: DeviceHub,
}

impl StateSink for Sink {
    fn on_state(&self, slot: u16, state: &ControllerState) {
        self.hub.on_state(slot, state);
    }
}

pub struct AppCore {
    session: Session,
    hub: DeviceHub,
    store: Mutex<Store>,
    feedback: Arc<Mutex<HashMap<u16, Feedback>>>,
    changes: broadcast::Sender<()>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl AppCore {
    /// Starts the session and the pads, applies the saved settings and recreates the saved
    /// controllers. Call inside the tokio runtime.
    pub async fn start(config: CoreConfig) -> Result<Arc<AppCore>, String> {
        let store = Store::open(&config.data_dir);
        let settings = store.saved.settings.clone().clamped();
        let mut session_config = config.session;
        session_config
            .data_dir
            .get_or_insert(config.data_dir.clone());
        session_config.grace = Duration::from_secs(settings.hold_seconds.into());

        let hub = DeviceHub::new(config.backend);
        let session = Session::start(session_config, Arc::new(Sink { hub: hub.clone() }))
            .await
            .map_err(|e| e.to_string())?;
        hub.attach(&session);
        session.set_phones_can_create(settings.phones_can_create);

        let (changes, _) = broadcast::channel(64);
        let feedback = Arc::new(Mutex::new(HashMap::<u16, Feedback>::new()));
        {
            let feedback = feedback.clone();
            let changes = changes.clone();
            hub.on_feedback(move |slot, f| {
                let mut all = lock(&feedback);
                let last = all.entry(slot).or_default();
                if f.rumble.is_some() {
                    last.rumble = f.rumble;
                }
                if f.lightbar.is_some() {
                    last.lightbar = f.lightbar;
                }
                let _ = changes.send(());
            });
        }

        // every session event (joins, drops, frees) changes what the window shows
        let mut events = session.events();
        let notify = changes.clone();
        tokio::spawn(async move {
            while let Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) = events.recv().await {
                let _ = notify.send(());
            }
        });

        let saved = store.saved.controllers.clone();
        let core = Arc::new(AppCore {
            session,
            hub,
            store: Mutex::new(store),
            feedback,
            changes,
        });
        for number in saved {
            if let Err(error) = core.session.create_slot_at(number) {
                tracing::warn!(number, ?error, "could not recreate a saved controller");
            }
        }
        Ok(core)
    }

    /// Fires whenever the window should refresh its snapshot.
    pub fn subscribe(&self) -> broadcast::Receiver<()> {
        self.changes.subscribe()
    }

    fn changed(&self) {
        let _ = self.changes.send(());
    }

    pub fn create(&self, number: Option<u16>) -> Result<u16, CoreError> {
        let number = match number {
            Some(n) => {
                self.session
                    .create_slot_at(n)
                    .map_err(|e| slot_error(n, e))?;
                n
            }
            None => self.session.create_slot(),
        };
        lock(&self.store).remember(number);
        self.changed();
        Ok(number)
    }

    /// Removes the controller (disconnecting its phone) and forgets it.
    pub fn remove(&self, number: u16) -> Result<(), CoreError> {
        let result = match self.session.remove_slot(number) {
            Err(SlotError::NotWaiting) => {
                self.session.kick(number).map_err(|e| slot_error(number, e))
            }
            other => other.map_err(|e| slot_error(number, e)),
        };
        let mut store = lock(&self.store);
        let remembered = store.remembers(number);
        store.forget(number);
        drop(store);
        self.changed();
        match result {
            Err(CoreError::NotFound(_)) if remembered => Ok(()),
            other => other,
        }
    }

    /// Disconnects the phone; a controller the player created stays, waiting for a phone.
    pub fn kick(&self, number: u16) -> Result<(), CoreError> {
        self.session
            .kick(number)
            .map_err(|e| slot_error(number, e))?;
        if lock(&self.store).remembers(number) {
            let _ = self.session.create_slot_at(number);
        }
        self.changed();
        Ok(())
    }

    pub fn settings(&self) -> Settings {
        lock(&self.store).saved.settings.clone()
    }

    pub fn update_settings(&self, settings: Settings) {
        let settings = settings.clamped();
        self.session
            .set_grace(Duration::from_secs(settings.hold_seconds.into()));
        self.session
            .set_phones_can_create(settings.phones_can_create);
        lock(&self.store).set_settings(settings);
        self.changed();
    }

    fn url(&self, host: &str, number: u16) -> String {
        let a = self.session.addresses();
        match a.secure_port {
            Some(443) => format!("https://{host}/{number}"),
            Some(port) => format!("https://{host}:{port}/{number}"),
            None if a.plain_port == 80 => format!("http://{host}/{number}?plain"),
            None => format!("http://{host}:{}/{number}?plain", a.plain_port),
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        let a = self.session.addresses();
        let ip = a
            .ips
            .first()
            .map(|ip| ip.to_string())
            .or_else(|| a.name.clone())
            .unwrap_or_else(|| "localhost".into());
        let feedback = lock(&self.feedback).clone();
        let now = Instant::now();
        let controllers = self
            .session
            .slots()
            .into_iter()
            .map(|s| {
                let (status, hold_left) = match s.status {
                    SlotStatus::Waiting => ("waiting", None),
                    SlotStatus::Connected => ("connected", None),
                    SlotStatus::Held { until } => (
                        "reconnecting",
                        Some(until.saturating_duration_since(now).as_secs()),
                    ),
                };
                let (pad, pad_error) = match self.hub.status(s.number) {
                    Some(PadStatus::Plugged) => ("plugged", None),
                    Some(PadStatus::Failed(why)) => ("failed", Some(why)),
                    Some(PadStatus::Unavailable) | None => ("unavailable", None),
                };
                let last = feedback.get(&s.number);
                ControllerView {
                    number: s.number,
                    status: status.into(),
                    hold_left,
                    device: s.device.as_ref().map(|d| d.to_string()),
                    connected_since: s
                        .connected_since
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64),
                    rtt_ms: s.rtt.map(|r| r.as_secs_f64() * 1000.0),
                    pad: pad.into(),
                    pad_error,
                    gyro: s.last_state.is_some_and(|st| st.gyro),
                    lightbar: last.and_then(|f| f.lightbar),
                    rumble: last.and_then(|f| f.rumble).map(|(a, b)| [a, b]),
                    url: self.url(&ip, s.number),
                    name_url: a.name.as_ref().map(|name| self.url(name, s.number)),
                }
            })
            .collect();
        Snapshot {
            addresses: AddressesView {
                name: a.name.clone(),
                ips: a.ips.iter().map(|ip| ip.to_string()).collect(),
                secure_port: a.secure_port,
                plain_port: a.plain_port,
            },
            driver: DriverView {
                ok: self.hub.backend_name().is_some(),
                backend: self.hub.backend_name().map(Into::into),
                reason: self.hub.unavailable().map(|u| u.reason.clone()),
                fix: self.hub.unavailable().map(|u| u.fix.clone()),
            },
            settings: self.settings(),
            controllers,
        }
    }

    /// The controller's current inputs, for the live view.
    pub fn live(&self, number: u16) -> Option<LiveView> {
        self.session
            .slots()
            .into_iter()
            .find(|s| s.number == number)?
            .last_state
            .as_ref()
            .map(LiveView::from)
    }

    /// One line per controller, for `ninjoy list`.
    pub fn list_lines(&self) -> Vec<String> {
        let snap = self.snapshot();
        if snap.controllers.is_empty() {
            return vec!["no controllers".into()];
        }
        snap.controllers
            .iter()
            .map(|c| {
                let rtt = c.rtt_ms.map(|r| format!("  {r:.1} ms")).unwrap_or_default();
                format!(
                    "{}  {}  {}{}  {}",
                    c.number,
                    c.status,
                    c.device.as_deref().unwrap_or("-"),
                    rtt,
                    c.url
                )
            })
            .collect()
    }

    /// Unplugs the pads and stops the servers.
    pub async fn shutdown(self: Arc<Self>) {
        self.hub.unplug_all();
        match Arc::try_unwrap(self) {
            Ok(core) => core.session.shutdown().await,
            Err(_) => {
                tracing::debug!("app core still shared at shutdown; servers stop with the process")
            }
        }
    }
}

/// A QR code for `text`, as an SVG document.
pub fn qr_svg(text: &str) -> String {
    match qrcode::QrCode::new(text.as_bytes()) {
        Ok(code) => code
            .render::<qrcode::render::svg::Color<'_>>()
            .min_dimensions(200, 200)
            .quiet_zone(false)
            .build(),
        Err(_) => String::from("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"),
    }
}
