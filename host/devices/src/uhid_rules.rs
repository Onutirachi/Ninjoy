//! The system files the Linux setup writes for the UHID backend. Plain text, available on every
//! platform, so the setup script can be built and tested anywhere.

/// The kernel module behind `/dev/uhid`.
pub const MODULE: &str = "uhid";

/// The rule that lets whoever is at the PC's local session create virtual pads. It must sort
/// before `73-seat-late.rules`, which turns `uaccess` into an ACL.
pub const UDEV_RULE: &str = r#"KERNEL=="uhid", MODE="0660", TAG+="uaccess""#;
pub const UDEV_RULE_FILE: &str = "/etc/udev/rules.d/71-ninjoy-uhid.rules";

/// Loads the module at boot, so `/dev/uhid` exists before anyone opens it.
pub const MODULES_LOAD_FILE: &str = "/etc/modules-load.d/ninjoy.conf";

/// Keeps the desktop pointer away from Ninjoy's touchpads: only devices whose `uniq` is a
/// Ninjoy pad's address (`02:4e:4a:…`, see `ds4::mac`), which no real controller uses.
pub const TOUCHPAD_RULE: &str = r#"SUBSYSTEM=="input", ATTRS{uniq}=="02:4e:4a:*", ATTRS{name}=="*Touchpad", ENV{LIBINPUT_IGNORE_DEVICE}="1""#;
pub const TOUCHPAD_RULE_FILE: &str = "/etc/udev/rules.d/72-ninjoy-touchpad.rules";
