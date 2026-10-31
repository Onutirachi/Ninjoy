//! Ninjoy host network core.
//!
//! Serves the controller page on the LAN, gives every phone a numbered controller slot and
//! exchanges controller states and feedback with it (see `specs/20261019-164925-lan-controller-session`).

mod connection;
pub mod device;
pub mod mdns;
pub mod net;
pub mod protocol;
mod server;
mod shared;
pub mod skins;
pub mod slots;
pub mod state;
pub mod tls;

use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};

use tokio::net::TcpListener;
use tokio::sync::{broadcast, watch};
use tokio::task::JoinHandle;

pub use device::DeviceSummary;
pub use shared::{Feedback, SessionEvent, StateSink};
pub use slots::{SlotError, SlotStatus};
pub use state::ControllerState;

use server::AppState;
use shared::{Control, Shared, lock};

#[derive(Clone, Debug)]
pub struct SessionConfig {
    /// ports to try for the secure server, in order; 0 = any free port; empty = no HTTPS
    pub secure_ports: Vec<u16>,
    /// ports to try for the plain (non-secure) server, in order; 0 = any free port
    pub plain_ports: Vec<u16>,
    /// the local network name, without `.local`
    pub local_name: String,
    /// where the certificate is kept; default: Ninjoy's app data folder
    pub data_dir: Option<PathBuf>,
    /// installed skins, one folder per skin id (the official skins are always there)
    pub skins_dir: Option<PathBuf>,
    /// announce the local name on the network (mDNS)
    pub announce: bool,
    pub grace: Duration,
    pub loss_timeout: Duration,
    /// serve the page from this folder instead of the copy built into the program
    pub web_root: Option<PathBuf>,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            secure_ports: vec![443, 8443],
            plain_ports: vec![80, 8080],
            local_name: "ninjoy".to_owned(),
            data_dir: None,
            skins_dir: None,
            announce: true,
            grace: Duration::from_secs(60),
            loss_timeout: Duration::from_secs(1),
            web_root: None,
        }
    }
}

#[derive(Debug)]
pub enum StartError {
    /// none of the ports could be used
    Bind {
        ports: Vec<u16>,
        source: std::io::Error,
    },
}

impl std::fmt::Display for StartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Bind { ports, source } => write!(
                f,
                "could not listen on any of the ports {ports:?}: {source}"
            ),
        }
    }
}

impl std::error::Error for StartError {}

/// Where phones can reach this PC.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Addresses {
    /// e.g. "ninjoy.local"; None when the name could not be announced
    pub name: Option<String>,
    pub ips: Vec<Ipv4Addr>,
    /// None when HTTPS could not start (the plain address still works, without motion sensors)
    pub secure_port: Option<u16>,
    pub plain_port: u16,
}

#[derive(Clone, Debug)]
pub struct SlotInfo {
    pub number: u16,
    pub status: SlotStatus,
    pub device: Option<DeviceSummary>,
    pub connected_since: Option<SystemTime>,
    pub last_state: Option<ControllerState>,
    pub rtt: Option<Duration>,
    /// the skin the phone uses: its own choice, or "" for the host's default
    pub skin: Option<String>,
}

/// A running session: servers, slots and connections.
pub struct Session {
    shared: Arc<Shared>,
    config: SessionConfig,
    addresses: Mutex<Addresses>,
    /// the phone servers; replaced when the ports change
    servers: tokio::sync::Mutex<Servers>,
    announcement: Mutex<Option<mdns::Announcement>>,
    stop_expiry: watch::Sender<bool>,
    expiry: JoinHandle<()>,
}

/// The running phone servers (plain and secure).
struct Servers {
    stop: watch::Sender<bool>,
    tasks: Vec<JoinHandle<()>>,
}

impl Servers {
    fn none() -> Self {
        Self {
            stop: watch::channel(false).0,
            tasks: Vec::new(),
        }
    }

    /// Stops accepting and waits (briefly) for the servers to let go of their ports.
    async fn stop(self) {
        let _ = self.stop.send(true);
        for mut task in self.tasks {
            if tokio::time::timeout(Duration::from_secs(2), &mut task)
                .await
                .is_err()
            {
                task.abort();
            }
        }
    }
}

impl Session {
    pub async fn start(
        config: SessionConfig,
        sink: Arc<dyn StateSink>,
    ) -> Result<Session, StartError> {
        let shared = Arc::new(Shared::new(
            sink,
            config.grace,
            config.loss_timeout,
            config.skins_dir.clone(),
        ));
        let ips = net::reachable_addresses();
        let (servers, secure_port, plain_port) = start_servers(
            &config,
            &shared,
            &ips,
            &config.secure_ports,
            &config.plain_ports,
            false,
        )
        .await?;

        let announcement = if config.announce {
            let (name, addresses) = (config.local_name.clone(), ips.clone());
            let port = secure_port.unwrap_or(plain_port);
            match tokio::task::spawn_blocking(move || mdns::announce(&name, &addresses, port)).await
            {
                Ok(Ok(announcement)) => Some(announcement),
                Ok(Err(error)) => {
                    tracing::warn!(%error, "the local name is not announced; use the IP address");
                    None
                }
                Err(_) => None,
            }
        } else {
            None
        };

        let (stop_expiry, stop_rx) = watch::channel(false);
        let expiry = tokio::spawn(expire_held_slots(shared.clone(), stop_rx));
        let addresses = Addresses {
            name: announcement.as_ref().map(|a| a.host.clone()),
            ips,
            secure_port,
            plain_port,
        };
        tracing::info!(?addresses, "session started");
        Ok(Session {
            shared,
            config,
            addresses: Mutex::new(addresses),
            servers: tokio::sync::Mutex::new(servers),
            announcement: Mutex::new(announcement),
            stop_expiry,
            expiry,
        })
    }

    pub fn addresses(&self) -> Addresses {
        lock(&self.addresses).clone()
    }

    /// Moves the phone servers to new ports; the slots and the virtual pads stay. Pages are
    /// closed, and every controller that had a phone is held for any phone for the hold time,
    /// because the page at the new address has a new device id. When a new port cannot be used,
    /// the servers keep (or go back to) the previous ports and the error names the port.
    pub async fn restart_servers(
        &self,
        secure_ports: Vec<u16>,
        plain_ports: Vec<u16>,
    ) -> Result<Addresses, StartError> {
        let mut servers = self.servers.lock().await;
        let previous = self.addresses();
        let ours: Vec<u16> = previous
            .secure_port
            .into_iter()
            .chain([previous.plain_port])
            .collect();
        // a port another program holds is refused before anything is touched
        usable(&plain_ports, &ours).await?;
        usable(&secure_ports, &ours).await?;

        let until = tokio::time::Instant::now() + self.shared.grace();
        let held = self.shared.with_table(|t| t.open_all_held(until));
        for &slot in &held {
            self.shared.neutralize(slot);
        }
        self.shared.close_all();
        std::mem::replace(&mut *servers, Servers::none())
            .stop()
            .await;
        // a page that connected meanwhile
        self.shared.close_all();
        for slot in held {
            self.shared.emit(SessionEvent::Disconnected { slot });
        }

        let ips = net::reachable_addresses();
        let started = start_servers(
            &self.config,
            &self.shared,
            &ips,
            &secure_ports,
            &plain_ports,
            true,
        )
        .await;
        let (new_servers, secure_port, plain_port) = match started {
            Ok(started) => started,
            Err(error) => {
                tracing::warn!(%error, "going back to the previous ports");
                let secure: Vec<u16> = previous.secure_port.into_iter().collect();
                match start_servers(
                    &self.config,
                    &self.shared,
                    &ips,
                    &secure,
                    &[previous.plain_port],
                    false,
                )
                .await
                {
                    Ok((back, ..)) => *servers = back,
                    Err(again) => {
                        tracing::error!(%again, "the phone servers could not start again")
                    }
                }
                return Err(error);
            }
        };
        *servers = new_servers;
        if let Some(announcement) = lock(&self.announcement).as_mut()
            && let Err(error) = announcement.update(&ips, secure_port.unwrap_or(plain_port))
        {
            tracing::warn!(%error, "the local name keeps its previous port");
        }
        let addresses = Addresses {
            name: previous.name,
            ips,
            secure_port,
            plain_port,
        };
        *lock(&self.addresses) = addresses.clone();
        tracing::info!(?addresses, "servers moved");
        Ok(addresses)
    }

    /// Snapshot of every slot, sorted by number.
    pub fn slots(&self) -> Vec<SlotInfo> {
        let table = lock(&self.shared.table);
        let live = lock(&self.shared.live);
        table
            .iter()
            .map(|(number, slot)| {
                let (last_state, rtt, skin) = live
                    .get(&number)
                    .map(|l| {
                        let l = lock(l);
                        (l.last_state, l.rtt, l.skin.clone())
                    })
                    .unwrap_or_default();
                SlotInfo {
                    number,
                    status: slot.status,
                    device: slot.summary.clone(),
                    connected_since: slot.connected_since,
                    last_state,
                    rtt,
                    skin,
                }
            })
            .collect()
    }

    /// Creates a controller waiting for a device at the lowest free number.
    pub fn create_slot(&self) -> u16 {
        let n = self.shared.with_table(|t| t.create());
        self.shared.emit(SessionEvent::SlotCreated(n));
        n
    }

    /// Creates a controller waiting for a device at `number`, if that number is free.
    pub fn create_slot_at(&self, number: u16) -> Result<(), SlotError> {
        self.shared.with_table(|t| t.create_at(number))?;
        self.shared.emit(SessionEvent::SlotCreated(number));
        Ok(())
    }

    /// Removes a controller that is still waiting for a device.
    pub fn remove_slot(&self, number: u16) -> Result<(), SlotError> {
        self.shared.with_table(|t| t.remove(number))?;
        self.shared.drop_live(number);
        self.shared.emit(SessionEvent::Freed { slot: number });
        Ok(())
    }

    /// Disconnects the player of `number` and frees the number at once.
    pub fn kick(&self, number: u16) -> Result<(), SlotError> {
        let conn = self.shared.with_table(|t| t.kick(number))?;
        self.shared.neutralize(number);
        self.shared.drop_live(number);
        if let Some(conn) = conn {
            self.shared.control(conn, Control::Kick);
        }
        self.shared.emit(SessionEvent::Kicked { slot: number });
        self.shared.emit(SessionEvent::Freed { slot: number });
        Ok(())
    }

    /// How long a dropped device's slot is held from now on (devices already dropped keep theirs).
    pub fn set_grace(&self, grace: Duration) {
        self.shared.grace_ms.store(
            grace.as_millis() as u64,
            std::sync::atomic::Ordering::Relaxed,
        );
    }

    /// Every skin in the library (official first), with the reason when one is broken.
    pub fn skins(&self) -> Vec<skins::SkinEntry> {
        self.shared.skins.entries()
    }

    /// The default skin phones use when they did not choose one.
    pub fn default_skin(&self) -> String {
        self.shared.skins.default()
    }

    /// Chooses the default skin; open pages are told at once.
    pub fn set_default_skin(&self, id: &str) {
        if self.shared.skins.set_default(id) {
            self.shared.skins_changed();
        }
    }

    /// Skins the app found broken (id → reason): phones are no longer offered them.
    pub fn set_broken_skins(&self, broken: std::collections::HashMap<String, String>) {
        if self.shared.skins.set_broken(broken) {
            self.shared.skins_changed();
        }
    }

    /// A file of a skin in the library (previews and validation in the app).
    pub fn skin_file(&self, id: &str, path: &str) -> Option<Vec<u8>> {
        self.shared.skins.read(id, path)
    }

    /// Tells open pages to look at the library again (a skin was added or removed).
    pub fn skins_changed(&self) {
        self.shared.skins_changed();
    }

    /// Whether phones may create controllers from the controller list (default: yes).
    pub fn set_phones_can_create(&self, allowed: bool) {
        self.shared.with_table(|t| t.set_phones_can_create(allowed));
    }

    /// Sends rumble and/or lightbar to the device of `number`; ignored if none is connected.
    pub fn send_feedback(&self, number: u16, feedback: Feedback) {
        self.feedback_handle().send(number, feedback);
    }

    /// A handle other threads (the device backend) use to send feedback.
    pub fn feedback_handle(&self) -> FeedbackHandle {
        FeedbackHandle(self.shared.clone())
    }

    pub fn events(&self) -> broadcast::Receiver<SessionEvent> {
        self.shared.events.subscribe()
    }

    pub async fn shutdown(self) {
        drop(self.announcement);
        self.servers.into_inner().stop().await;
        let _ = self.stop_expiry.send(true);
        let _ = self.expiry.await;
    }
}

/// Sends feedback to phones from any thread; see [`Session::feedback_handle`].
#[derive(Clone)]
pub struct FeedbackHandle(Arc<Shared>);

impl FeedbackHandle {
    /// Sends rumble and/or lightbar to the device of `number`; ignored if none is connected.
    pub fn send(&self, number: u16, feedback: Feedback) {
        let Some(conn) = lock(&self.0.table).get(number).map(|s| s.conn) else {
            return; // no such slot
        };
        if let Some(color) = feedback.lightbar {
            lock(&self.0.live(number)).lightbar = Some(color);
        }
        if let Some(conn) = conn {
            self.0.control(conn, Control::Send(feedback.to_message()));
        }
    }
}

/// Starts the plain server and, when it can, the secure one. Without `secure_required`, a
/// secure server that cannot start only leaves the session without HTTPS.
async fn start_servers(
    config: &SessionConfig,
    shared: &Arc<Shared>,
    ips: &[Ipv4Addr],
    secure_ports: &[u16],
    plain_ports: &[u16],
    secure_required: bool,
) -> Result<(Servers, Option<u16>, u16), StartError> {
    let (stop, stop_rx) = watch::channel(false);
    let secure_port_cell = Arc::new(OnceLock::new());
    let plain = bind(plain_ports).await?;
    let plain_port = plain.local_addr().map(|a| a.port()).unwrap_or_default();
    let app = server::router(AppState {
        shared: shared.clone(),
        web_root: config.web_root.clone(),
        plain: true,
        secure_port: secure_port_cell.clone(),
    });
    let mut stop_plain = stop_rx.clone();
    let serve_plain = tokio::spawn(async move {
        let service = app.into_make_service_with_connect_info::<SocketAddr>();
        let shutdown = async move {
            let _ = stop_plain.wait_for(|stopped| *stopped).await;
        };
        if let Err(error) = axum::serve(plain, service)
            .with_graceful_shutdown(shutdown)
            .await
        {
            tracing::error!(%error, "plain server stopped");
        }
    });
    let mut servers = Servers {
        stop,
        tasks: vec![serve_plain],
    };

    let secure_port = match start_secure(
        config,
        secure_ports,
        shared,
        ips,
        secure_port_cell.clone(),
        stop_rx,
    )
    .await
    {
        Ok((port, task)) => {
            servers.tasks.push(task);
            Some(port)
        }
        Err(SecureError::Bind(error)) if secure_required => {
            servers.stop().await;
            return Err(error);
        }
        Err(error) => {
            tracing::error!(%error, "HTTPS is not available; motion sensors will not work");
            None
        }
    };
    let _ = secure_port_cell.set(secure_port);
    Ok((servers, secure_port, plain_port))
}

/// Whether one of `ports` can be listened on: a free one, 0 (any), or one of `ours` (the
/// running servers let go of it).
async fn usable(ports: &[u16], ours: &[u16]) -> Result<(), StartError> {
    if ports.is_empty() {
        return Ok(());
    }
    let mut last_error = None;
    for &port in ports {
        if port == 0 || ours.contains(&port) {
            return Ok(());
        }
        match TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await {
            Ok(_) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }
    let source = last_error.unwrap_or_else(|| std::io::Error::other("no port configured"));
    Err(StartError::Bind {
        ports: ports.to_vec(),
        source,
    })
}

async fn bind(ports: &[u16]) -> Result<TcpListener, StartError> {
    let mut last_error = None;
    for &port in ports {
        match TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await {
            Ok(listener) => return Ok(listener),
            Err(error) => {
                tracing::warn!(port, %error, "port unavailable");
                last_error = Some(error);
            }
        }
    }
    let source = last_error.unwrap_or_else(|| std::io::Error::other("no port configured"));
    Err(StartError::Bind {
        ports: ports.to_vec(),
        source,
    })
}

enum SecureError {
    Bind(StartError),
    Other(std::io::Error),
}

impl std::fmt::Display for SecureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Bind(error) => error.fmt(f),
            Self::Other(error) => error.fmt(f),
        }
    }
}

impl From<std::io::Error> for SecureError {
    fn from(error: std::io::Error) -> Self {
        Self::Other(error)
    }
}

/// The HTTPS server with the per-install certificate.
async fn start_secure(
    config: &SessionConfig,
    ports: &[u16],
    shared: &Arc<Shared>,
    ips: &[Ipv4Addr],
    secure_port: Arc<OnceLock<Option<u16>>>,
    mut stop: watch::Receiver<bool>,
) -> Result<(u16, JoinHandle<()>), SecureError> {
    if ports.is_empty() {
        return Err(std::io::Error::other("no secure port configured").into());
    }
    // rustls is built without a default crypto provider (see Cargo.toml)
    let _ = rustls::crypto::ring::default_provider().install_default();
    let dir = config
        .data_dir
        .clone()
        .unwrap_or_else(tls::default_data_dir);
    let cert = tls::load_or_create(&dir, &config.local_name, ips)?;
    let tls_config = axum_server::tls_rustls::RustlsConfig::from_pem(
        cert.cert_pem.into_bytes(),
        cert.key_pem.into_bytes(),
    )
    .await?;
    let listener = bind(ports).await.map_err(SecureError::Bind)?.into_std()?;
    let port = listener.local_addr()?.port();
    let app = server::router(AppState {
        shared: shared.clone(),
        web_root: config.web_root.clone(),
        plain: false,
        secure_port,
    });
    let handle = axum_server::Handle::new();
    let server = axum_server::from_tcp_rustls(listener, tls_config)?.handle(handle.clone());
    let task = tokio::spawn(async move {
        let stopper = tokio::spawn(async move {
            let _ = stop.wait_for(|stopped| *stopped).await;
            handle.graceful_shutdown(Some(Duration::from_secs(1)));
        });
        let service = app.into_make_service_with_connect_info::<SocketAddr>();
        if let Err(error) = server.serve(service).await {
            tracing::error!(%error, "secure server stopped");
        }
        stopper.abort();
    });
    Ok((port, task))
}

/// Frees held slots whose grace period is over.
async fn expire_held_slots(shared: Arc<Shared>, mut stop: watch::Receiver<bool>) {
    let mut tick = tokio::time::interval(Duration::from_millis(250));
    loop {
        tokio::select! {
            _ = tick.tick() => {
                let now = tokio::time::Instant::now();
                for slot in shared.with_table(|t| t.expire(now)) {
                    shared.drop_live(slot);
                    shared.emit(SessionEvent::Freed { slot });
                }
            }
            _ = stop.wait_for(|stopped| *stopped) => return,
        }
    }
}
