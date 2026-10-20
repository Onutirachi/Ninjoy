//! The running app's command channel, only for the same user: a named pipe on Windows, a Unix
//! socket in the user's runtime folder on Linux. One request line in, the answer out ("ok" or
//! "error" on the first line, then the text), then the connection closes. It also keeps a
//! single running copy: a second start finds the channel and asks the first copy to show itself.

use std::fmt;
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader as AsyncBufReader};

use crate::core::AppCore;

#[derive(Debug)]
pub enum ChannelError {
    /// no Ninjoy answers on this channel
    NotRunning,
    /// another copy already listens
    AlreadyRunning,
    Io(std::io::Error),
}

impl fmt::Display for ChannelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ChannelError::NotRunning => f.write_str("Ninjoy is not running"),
            ChannelError::AlreadyRunning => f.write_str("Ninjoy is already running"),
            ChannelError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ChannelError {}

/// This user's channel name.
pub fn default_name() -> String {
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "user".into());
    let user: String = user
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    format!("ninjoy-{user}")
}

/// Handles one request line and returns (ok, text).
fn handle(core: &AppCore, line: &str, show: &(dyn Fn() + Send + Sync)) -> (bool, String) {
    let words: Vec<&str> = line.split_whitespace().collect();
    let number = |w: &str| w.parse::<u16>().ok();
    let created = |n: u16| {
        let url = core
            .snapshot()
            .controllers
            .into_iter()
            .find(|c| c.number == n)
            .map(|c| c.url)
            .unwrap_or_default();
        (true, format!("controller {n} created  {url}"))
    };
    match words.as_slice() {
        ["create"] => match core.create(None) {
            Ok(n) => created(n),
            Err(e) => (false, e.to_string()),
        },
        ["create", n] => match number(n) {
            Some(n) => match core.create(Some(n)) {
                Ok(n) => created(n),
                Err(e) => (false, e.to_string()),
            },
            None => (false, "usage: create [number]".into()),
        },
        ["remove", n] => match number(n).map(|n| (n, core.remove(n))) {
            Some((n, Ok(()))) => (true, format!("controller {n} removed")),
            Some((_, Err(e))) => (false, e.to_string()),
            None => (false, "usage: remove <number>".into()),
        },
        ["kick", n] => match number(n).map(|n| (n, core.kick(n))) {
            Some((n, Ok(()))) => (true, format!("controller {n} disconnected")),
            Some((_, Err(e))) => (false, e.to_string()),
            None => (false, "usage: kick <number>".into()),
        },
        ["list"] => (true, core.list_lines().join("\n")),
        ["show"] => {
            show();
            (true, "shown".into())
        }
        _ => (false, format!("unknown command: {line}")),
    }
}

/// Listens on `name` for the app's lifetime; `show` brings the window forward. Call inside the
/// tokio runtime. Fails with [`ChannelError::AlreadyRunning`] when another copy listens.
pub fn serve(
    name: &str,
    core: Arc<AppCore>,
    show: impl Fn() + Send + Sync + 'static,
) -> Result<(), ChannelError> {
    let show: Arc<dyn Fn() + Send + Sync> = Arc::new(show);
    platform::serve(name, move |line: String| {
        let core = core.clone();
        let show = show.clone();
        handle(&core, &line, &*show)
    })
}

/// Sends `request` to the running app (blocking): (ok, text).
pub fn send(name: &str, request: &str) -> Result<(bool, String), ChannelError> {
    let mut stream = platform::connect(name)?;
    stream
        .write_all(format!("{request}\n").as_bytes())
        .map_err(ChannelError::Io)?;
    stream.flush().map_err(ChannelError::Io)?;
    let mut reader = BufReader::new(stream);
    let mut status = String::new();
    reader.read_line(&mut status).map_err(ChannelError::Io)?;
    let mut text = String::new();
    reader.read_to_string(&mut text).map_err(ChannelError::Io)?;
    Ok((status.trim() == "ok", text.trim_end().to_string()))
}

async fn answer<S>(stream: S, handle: Arc<dyn Fn(String) -> (bool, String) + Send + Sync>)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let mut stream = AsyncBufReader::new(stream);
    let mut line = String::new();
    if stream.read_line(&mut line).await.is_err() {
        return;
    }
    let (ok, text) = handle(line.trim().to_string());
    let reply = format!("{}\n{text}\n", if ok { "ok" } else { "error" });
    let mut stream = stream.into_inner();
    let _ = stream.write_all(reply.as_bytes()).await;
    let _ = stream.shutdown().await;
}

#[cfg(windows)]
mod platform {
    use std::fs::{File, OpenOptions};
    use std::sync::Arc;

    use tokio::net::windows::named_pipe::ServerOptions;

    use super::{ChannelError, answer};

    fn path(name: &str) -> String {
        format!(r"\\.\pipe\{name}")
    }

    pub fn serve(
        name: &str,
        handle: impl Fn(String) -> (bool, String) + Send + Sync + 'static,
    ) -> Result<(), ChannelError> {
        let path = path(name);
        // the default security lets only this user (and administrators) write to the pipe
        let first = ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(&path)
            .map_err(|e| {
                if e.raw_os_error() == Some(5) {
                    ChannelError::AlreadyRunning
                } else {
                    ChannelError::Io(e)
                }
            })?;
        let handle: Arc<dyn Fn(String) -> (bool, String) + Send + Sync> = Arc::new(handle);
        tokio::spawn(async move {
            let mut server = first;
            loop {
                if server.connect().await.is_err() {
                    break;
                }
                let next = match ServerOptions::new()
                    .reject_remote_clients(true)
                    .create(&path)
                {
                    Ok(next) => next,
                    Err(_) => break,
                };
                let connected = std::mem::replace(&mut server, next);
                tokio::spawn(answer(connected, handle.clone()));
            }
        });
        Ok(())
    }

    pub fn connect(name: &str) -> Result<File, ChannelError> {
        let path = path(name);
        for _ in 0..50 {
            match OpenOptions::new().read(true).write(true).open(&path) {
                Ok(file) => return Ok(file),
                // all instances busy: the server is about to create the next one
                Err(e) if e.raw_os_error() == Some(231) => {
                    std::thread::sleep(std::time::Duration::from_millis(10))
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Err(ChannelError::NotRunning);
                }
                Err(e) => return Err(ChannelError::Io(e)),
            }
        }
        Err(ChannelError::NotRunning)
    }
}

#[cfg(unix)]
mod platform {
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::net::UnixStream;
    use std::path::PathBuf;
    use std::sync::Arc;

    use tokio::net::UnixListener;

    use super::{ChannelError, answer};

    fn path(name: &str) -> PathBuf {
        // the runtime folder is private to the user (0700)
        let dir = std::env::var_os("XDG_RUNTIME_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        dir.join(format!("{name}.sock"))
    }

    pub fn serve(
        name: &str,
        handle: impl Fn(String) -> (bool, String) + Send + Sync + 'static,
    ) -> Result<(), ChannelError> {
        let path = path(name);
        if path.exists() {
            if UnixStream::connect(&path).is_ok() {
                return Err(ChannelError::AlreadyRunning);
            }
            // left over by a copy that crashed
            let _ = std::fs::remove_file(&path);
        }
        let listener = UnixListener::bind(&path).map_err(ChannelError::Io)?;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(ChannelError::Io)?;
        let handle: Arc<dyn Fn(String) -> (bool, String) + Send + Sync> = Arc::new(handle);
        tokio::spawn(async move {
            while let Ok((stream, _)) = listener.accept().await {
                tokio::spawn(answer(stream, handle.clone()));
            }
        });
        Ok(())
    }

    pub fn connect(name: &str) -> Result<UnixStream, ChannelError> {
        UnixStream::connect(path(name)).map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound | std::io::ErrorKind::ConnectionRefused => {
                ChannelError::NotRunning
            }
            _ => ChannelError::Io(e),
        })
    }
}
