//! The Ninjoy desktop app's core, without a window: controllers, saved settings, the local
//! command channel and the command line. The Tauri app (`host/app`) puts a window on top.

pub mod channel;
pub mod cli;
mod core;
mod store;

pub use crate::core::{
    AddressesView, AppCore, ControllerView, CoreConfig, CoreError, DriverView, LiveView, SkinView,
    Snapshot, data_dir, qr_svg,
};
pub use store::{Language, Saved, Settings, Theme};
