//! Ninjoy virtual controllers: every session slot becomes a virtual DualShock 4.
//!
//! [`ds4`] builds the reports, [`backend`] is the boundary each platform implements (ViGEmBus on
//! Windows, UHID on Linux), and [`DeviceHub`] connects them to the session.

pub mod backend;
pub mod ds4;
mod hub;
#[cfg(target_os = "linux")]
pub mod uhid;
pub mod uhid_rules;
#[cfg(windows)]
pub mod vigem;

pub use backend::{Backend, DeviceError, OnFeedback, Pad, Unavailable, open_default};
pub use hub::{DeviceHub, PadStatus};
