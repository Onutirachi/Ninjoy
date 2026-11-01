//! The app without its window: runs the session and the virtual pads, creates and removes
//! controllers, keeps settings, and describes everything for the window and the command line.

use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, UNIX_EPOCH};

use tokio::time::Instant;

use ninjoy_devices::{Backend, DeviceHub, PadStatus, Unavailable};
use ninjoy_session::slots::{SlotError, SlotStatus};
use ninjoy_session::{ControllerState, Feedback, Session, SessionConfig, StateSink};
use serde::Serialize;
use tokio::sync::broadcast;

use crate::setup::{ItemId, ItemState, SetupView};
use crate::store::{AUTOMATIC_PLAIN, PortsMode, PortsSetting, Settings, Store};

pub struct CoreConfig {
    /// where `app.json` (and the session's certificate, unless set) live
    pub data_dir: PathBuf,
    /// its port lists are what the Automatic ports setting tries
    pub session: SessionConfig,
    pub backend: Result<Box<dyn Backend>, Unavailable>,
    /// check the Linux setup items on this system (off in tests, which must not depend on the
    /// machine they run on)
    pub check_setup: bool,
}

impl CoreConfig {
    /// The data folder (see [`data_dir`]), default ports and the platform's virtual controller
    /// backend.
    pub fn for_user() -> Self {
        let user = directories::ProjectDirs::from("", "", "Ninjoy")
            .map(|d| d.data_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("ninjoy-data"));
        let beside = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|d| d.join("data")));
        Self {
            data_dir: beside.map_or(user.clone(), |beside| data_dir(&beside, &user)),
            session: SessionConfig::default(),
            backend: ninjoy_devices::open_default(),
            check_setup: true,
        }
    }
}

/// Where the app keeps its settings, certificate and skins: a `data` folder beside the program,
/// so copying the program's folder backs up everything; the user's data folder when the
/// program's folder cannot be written (installed for every user, a read-only image). The first
/// time the folder beside the program is used, the user's data folder is copied into it, so
/// phones keep trusting the certificate.
pub fn data_dir(beside: &Path, user: &Path) -> PathBuf {
    if beside.is_dir() {
        return beside.to_path_buf();
    }
    if std::fs::create_dir_all(beside).is_err() || !writable(beside) {
        let _ = std::fs::remove_dir(beside);
        return user.to_path_buf();
    }
    if user.is_dir()
        && let Err(e) = copy_dir(user, beside)
    {
        tracing::warn!(
            "could not copy {} to {}: {e}",
            user.display(),
            beside.display()
        );
    }
    beside.to_path_buf()
}

fn writable(dir: &Path) -> bool {
    let probe = dir.join(".ninjoy-write-test");
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(probe);
    ok
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CoreError {
    NotFound(u16),
    Taken(u16),
    Invalid,
    /// Linux does not let Ninjoy create virtual controllers yet
    SetupNeeded,
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoreError::NotFound(n) => write!(f, "there is no controller {n}"),
            CoreError::Taken(n) => write!(f, "controller {n} already exists"),
            CoreError::Invalid => f.write_str("controller numbers start at 1"),
            CoreError::SetupNeeded => {
                f.write_str("Ninjoy does not have permission to create virtual controllers")
            }
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
    /// the skin library, official skins first
    pub skins: Vec<SkinView>,
    /// the Linux setup items; None on other systems
    pub setup: Option<SetupView>,
}

/// What a Configure run did.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupConfigureResult {
    pub setup: Option<SetupView>,
    /// the phone servers moved to other ports: phones must scan their QR code again
    pub ports_moved: bool,
}

/// Whether the phone servers should move to the standard ports: Automatic, low ports now
/// allowed, and still running on the alternate plain port.
pub fn should_move_to_low_ports(
    ports: &PortsSetting,
    low_allowed: bool,
    running_plain: u16,
) -> bool {
    ports.mode == PortsMode::Automatic && low_allowed && running_plain != AUTOMATIC_PLAIN
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinView {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub format: u8,
    pub bundled: bool,
    pub preview: Option<String>,
    pub files: Vec<String>,
    /// why phones are not offered it, if so
    pub broken: Option<String>,
    /// the skin phones use unless they pick their own
    pub is_default: bool,
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
    /// the skin the phone uses (its own choice or the default)
    pub skin: Option<String>,
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

/// The port lists the Automatic setting tries.
struct AutomaticPorts {
    secure: Vec<u16>,
    plain: Vec<u16>,
}

pub struct AppCore {
    session: Session,
    /// read by the Linux setup
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    data_dir: PathBuf,
    check_setup: bool,
    automatic: AutomaticPorts,
    /// the last Linux setup check
    setup: Mutex<Option<SetupView>>,
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
        // installed skins live next to the app's data
        let skins_dir = session_config
            .skins_dir
            .get_or_insert(config.data_dir.join("skins"))
            .clone();
        let _ = std::fs::create_dir_all(skins_dir);
        session_config.grace = Duration::from_secs(settings.hold_seconds.into());
        // the configured lists are what Automatic tries
        let automatic = AutomaticPorts {
            secure: session_config.secure_ports.clone(),
            plain: session_config.plain_ports.clone(),
        };
        session_config.secure_ports = settings.ports.secure_ports(&automatic.secure);
        session_config.plain_ports = settings.ports.plain_ports(&automatic.plain);

        let hub = DeviceHub::new(config.backend);
        let session = Session::start(session_config, Arc::new(Sink { hub: hub.clone() }))
            .await
            .map_err(|e| e.to_string())?;
        hub.attach(&session);
        session.set_phones_can_create(settings.phones_can_create);
        session.set_default_skin(&settings.default_skin);

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
            data_dir: config.data_dir,
            check_setup: config.check_setup,
            automatic,
            setup: Mutex::new(None),
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
        core.setup_check();
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
        if self.controllers_missing() {
            return Err(CoreError::SetupNeeded);
        }
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

    /// Checks the Linux setup items again (and starts the virtual pads if they are now
    /// allowed). None on other systems.
    pub fn setup_check(&self) -> Option<SetupView> {
        if !self.check_setup {
            return None;
        }
        let view = self.run_check(None)?;
        self.after_setup(view.clone());
        Some(view)
    }

    #[cfg(target_os = "linux")]
    fn run_check(&self, outcome: Option<crate::setup::Outcome>) -> Option<SetupView> {
        let settings = self.settings();
        Some(SetupView::new(
            crate::setup::check(&settings.ports, &settings.setup, &self.data_dir),
            outcome,
        ))
    }

    #[cfg(not(target_os = "linux"))]
    fn run_check(&self, _outcome: Option<crate::setup::Outcome>) -> Option<SetupView> {
        None
    }

    /// Applies the missing Linux setup items (all, or only `items`) with one password prompt
    /// (waits for the user), then moves the phone servers to the standard ports when that is
    /// now allowed.
    pub async fn setup_configure(
        self: &Arc<Self>,
        items: Option<Vec<ItemId>>,
    ) -> SetupConfigureResult {
        let core = self.clone();
        let view = tokio::task::spawn_blocking(move || core.run_configure(items.as_deref()))
            .await
            .ok()
            .flatten();
        let Some(view) = view else {
            return SetupConfigureResult {
                setup: None,
                ports_moved: false,
            };
        };
        self.after_setup(view.clone());
        let low_allowed = view
            .items
            .iter()
            .any(|item| item.id == ItemId::Ports && item.state == ItemState::Done);
        let ports = self.settings().ports;
        let mut ports_moved = false;
        if should_move_to_low_ports(&ports, low_allowed, self.session.addresses().plain_port) {
            match self
                .session
                .restart_servers(
                    ports.secure_ports(&self.automatic.secure),
                    ports.plain_ports(&self.automatic.plain),
                )
                .await
            {
                Ok(_) => ports_moved = true,
                Err(error) => tracing::warn!(%error, "the servers stay on their ports"),
            }
            self.changed();
        }
        SetupConfigureResult {
            setup: Some(view),
            ports_moved,
        }
    }

    #[cfg(target_os = "linux")]
    fn run_configure(&self, items: Option<&[ItemId]>) -> Option<SetupView> {
        let settings = self.settings();
        Some(crate::setup::configure(
            &settings.ports,
            &settings.setup,
            &self.data_dir,
            items,
        ))
    }

    #[cfg(not(target_os = "linux"))]
    fn run_configure(&self, _items: Option<&[ItemId]>) -> Option<SetupView> {
        None
    }

    /// Makes the controllers' touchpad a desktop mouse (`on`) or not, with one password prompt;
    /// the setting changes only when that worked.
    pub async fn setup_touchpad_mouse(self: &Arc<Self>, on: bool) -> SetupConfigureResult {
        let core = self.clone();
        let view = tokio::task::spawn_blocking(move || core.run_touchpad_mouse(on))
            .await
            .ok()
            .flatten();
        if let Some(view) = &view {
            self.after_setup(view.clone());
        }
        SetupConfigureResult {
            setup: view,
            ports_moved: false,
        }
    }

    #[cfg(target_os = "linux")]
    fn run_touchpad_mouse(&self, on: bool) -> Option<SetupView> {
        use crate::setup::RunError;
        match crate::setup::set_touchpad_mouse(on) {
            Ok(()) => {
                let mut settings = self.settings();
                settings.setup.touchpad_mouse = on;
                lock(&self.store).set_settings(settings);
                self.run_check(None)
            }
            Err(RunError::NotRun(outcome)) => self.run_check(Some(outcome)),
            Err(RunError::Failed(reason)) => {
                tracing::warn!(%reason, "the touchpad setting did not change");
                self.run_check(None)
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    fn run_touchpad_mouse(&self, _on: bool) -> Option<SetupView> {
        None
    }

    /// Linux does not let Ninjoy create virtual controllers yet: neither the PC nor phones may
    /// create controllers games would not see.
    fn controllers_missing(&self) -> bool {
        lock(&self.setup).as_ref().is_some_and(|view| {
            view.items
                .iter()
                .any(|item| item.id == ItemId::Controllers && item.state != ItemState::Done)
        })
    }

    fn apply_phone_permission(&self) {
        let allowed = self.settings().phones_can_create && !self.controllers_missing();
        self.session.set_phones_can_create(allowed);
    }

    /// Keeps the view for the snapshot and starts the pads once the system allows them.
    fn after_setup(&self, view: SetupView) {
        #[cfg(target_os = "linux")]
        {
            let controllers = view
                .items
                .iter()
                .any(|item| item.id == ItemId::Controllers && item.state == ItemState::Done);
            if controllers && self.hub.backend_name().is_none() {
                match ninjoy_devices::open_default() {
                    Ok(backend) => {
                        let slots: Vec<u16> =
                            self.session.slots().iter().map(|s| s.number).collect();
                        self.hub.set_backend(backend, &slots);
                        tracing::info!("virtual controllers are now available");
                    }
                    Err(why) => tracing::warn!(%why, "virtual controllers are still unavailable"),
                }
            }
        }
        *lock(&self.setup) = Some(view);
        self.apply_phone_permission();
        self.changed();
    }

    /// Tests stand in for the Linux check on any system.
    #[doc(hidden)]
    pub fn inject_setup_view(&self, view: SetupView) {
        self.after_setup(view);
    }

    pub fn update_settings(&self, settings: Settings) {
        let settings = settings.clamped();
        self.session
            .set_grace(Duration::from_secs(settings.hold_seconds.into()));
        self.session.set_default_skin(&settings.default_skin);
        lock(&self.store).set_settings(settings);
        self.apply_phone_permission();
        self.changed();
    }

    /// The address phones open (and the QR code): the plain one, which explains the certificate
    /// warning the first time and goes straight to the secure controller once it is accepted.
    fn url(&self, host: &str, number: u16) -> String {
        let a = self.session.addresses();
        let base = match a.plain_port {
            80 => format!("http://{host}/{number}"),
            port => format!("http://{host}:{port}/{number}"),
        };
        if a.secure_port.is_some() {
            base
        } else {
            format!("{base}?plain")
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
        let default_skin = self.session.default_skin();
        let now = Instant::now();
        let controllers = self
            .session
            .slots()
            .into_iter()
            .map(|s| {
                let (status, hold_left) = match s.status {
                    SlotStatus::Waiting => ("waiting", None),
                    SlotStatus::Connected => ("connected", None),
                    SlotStatus::Held { until, .. } => (
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
                    skin: s.skin.as_ref().map(|id| {
                        if id.is_empty() {
                            default_skin.clone()
                        } else {
                            id.clone()
                        }
                    }),
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
            setup: lock(&self.setup).clone(),
            settings: self.settings(),
            controllers,
            skins: self
                .session
                .skins()
                .into_iter()
                .map(|e| SkinView {
                    is_default: e.id == default_skin,
                    id: e.id,
                    name: e.name,
                    author: e.author,
                    version: e.version,
                    format: e.format,
                    bundled: e.bundled,
                    preview: e.preview,
                    files: e.files,
                    broken: e.broken,
                })
                .collect(),
        }
    }

    /// A file of a skin in the library (previews and validation in the window).
    pub fn skin_file(&self, id: &str, path: &str) -> Option<Vec<u8>> {
        self.session.skin_file(id, path)
    }

    /// Skins the window's validation found broken (id → reason): phones are not offered them.
    pub fn set_broken_skins(&self, broken: std::collections::HashMap<String, String>) {
        self.session.set_broken_skins(broken);
        self.changed();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_servers_move_to_the_standard_ports_once_allowed() {
        let automatic = PortsSetting::default();
        assert!(should_move_to_low_ports(&automatic, true, 8080));
        assert!(
            !should_move_to_low_ports(&automatic, true, 80),
            "already there"
        );
        assert!(
            !should_move_to_low_ports(&automatic, false, 8080),
            "not allowed"
        );
        let custom = PortsSetting {
            mode: PortsMode::Custom,
            secure: 443,
            plain: 80,
        };
        assert!(
            !should_move_to_low_ports(&custom, true, 8080),
            "custom ports stay"
        );
    }
}
