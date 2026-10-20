//! The boundary every virtual device backend implements; nothing outside a backend depends on a
//! driver.

use std::fmt;
use std::sync::Arc;

use ninjoy_session::Feedback;

use crate::ds4::Report;

/// Called by a backend (on any thread) when the game sends rumble or lightbar to a pad.
pub type OnFeedback = Arc<dyn Fn(Feedback) + Send + Sync>;

/// Creates virtual pads on one platform.
pub trait Backend: Send + Sync {
    /// Short name for logs ("ViGEmBus", "UHID").
    fn name(&self) -> &'static str;
    /// Plugs a pad for `slot`; dropping the pad unplugs it.
    fn plug(&self, slot: u16, feedback: OnFeedback) -> Result<Box<dyn Pad>, DeviceError>;
}

/// One plugged virtual DualShock 4.
pub trait Pad: Send {
    /// Sends one input report (report 0x01, 64 bytes).
    fn submit(&mut self, report: &Report) -> Result<(), DeviceError>;
}

/// A pad could not be plugged or updated.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeviceError(pub String);

impl fmt::Display for DeviceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for DeviceError {}

/// Why no virtual pads can be created on this computer, and what fixes it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unavailable {
    pub reason: String,
    pub fix: String,
}

impl fmt::Display for Unavailable {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}. {}", self.reason, self.fix)
    }
}

/// The backend for this platform, or why it cannot work here.
pub fn open_default() -> Result<Box<dyn Backend>, Unavailable> {
    #[cfg(windows)]
    return crate::vigem::open().map(|b| Box::new(b) as Box<dyn Backend>);
    #[cfg(target_os = "linux")]
    return crate::uhid::open().map(|b| Box::new(b) as Box<dyn Backend>);
    #[allow(unreachable_code)]
    Err(Unavailable {
        reason: "Virtual controllers are not supported on this operating system".into(),
        fix: "Ninjoy creates virtual controllers on Windows and Linux.".into(),
    })
}
