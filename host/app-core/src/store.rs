//! What the app remembers between runs: settings and the controllers the player created.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Auto,
    Dark,
    Light,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    Auto,
    En,
    Pt,
}

/// Which ports the phone server uses.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PortsMode {
    /// the standard ports, with the alternates when those are taken or not allowed
    #[default]
    Automatic,
    /// exactly `secure` and `plain`
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PortsSetting {
    pub mode: PortsMode,
    pub secure: u16,
    pub plain: u16,
}

impl Default for PortsSetting {
    fn default() -> Self {
        Self {
            mode: PortsMode::Automatic,
            secure: 443,
            plain: 80,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PortsError {
    /// ports go from 1 to 65535
    OutOfRange,
    /// the secure and the plain port must differ
    Same,
}

impl std::fmt::Display for PortsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::OutOfRange => "ports go from 1 to 65535",
            Self::Same => "the secure and the plain port must be different",
        })
    }
}

impl std::error::Error for PortsError {}

impl PortsSetting {
    /// Custom ports must be usable; Automatic ignores them.
    pub fn validate(&self) -> Result<(), PortsError> {
        if self.mode == PortsMode::Automatic {
            return Ok(());
        }
        if self.secure == 0 || self.plain == 0 {
            return Err(PortsError::OutOfRange);
        }
        if self.secure == self.plain {
            return Err(PortsError::Same);
        }
        Ok(())
    }

    /// The secure ports to try, in order: `automatic` (the standard port and its alternate) or
    /// exactly the custom one.
    pub fn secure_ports(&self, automatic: &[u16]) -> Vec<u16> {
        match self.mode {
            PortsMode::Automatic => automatic.to_vec(),
            PortsMode::Custom => vec![self.secure],
        }
    }

    /// The plain ports to try, in order; see [`Self::secure_ports`].
    pub fn plain_ports(&self, automatic: &[u16]) -> Vec<u16> {
        match self.mode {
            PortsMode::Automatic => automatic.to_vec(),
            PortsMode::Custom => vec![self.plain],
        }
    }

    /// The lowest port below 1024 this setting wants (Linux needs a permission for it).
    pub fn wanted_low_port(&self) -> Option<u16> {
        let wanted = match self.mode {
            PortsMode::Automatic => vec![AUTOMATIC_SECURE, AUTOMATIC_PLAIN],
            PortsMode::Custom => vec![self.secure, self.plain],
        };
        wanted.into_iter().filter(|&p| p < 1024).min()
    }
}

/// The standard ports Automatic tries first.
pub const AUTOMATIC_SECURE: u16 = 443;
pub const AUTOMATIC_PLAIN: u16 = 80;

/// Hold time limits (seconds).
pub const HOLD_MIN: u16 = 10;
pub const HOLD_MAX: u16 = 300;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub theme: Theme,
    pub language: Language,
    /// how long a dropped controller is held, seconds
    pub hold_seconds: u16,
    pub phones_can_create: bool,
    pub start_with_system: bool,
    /// closing the window keeps Ninjoy running in the tray (otherwise it quits)
    pub close_to_tray: bool,
    /// the skin phones use unless they pick their own
    pub default_skin: String,
    pub ports: PortsSetting,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::Auto,
            language: Language::Auto,
            hold_seconds: 60,
            phones_can_create: true,
            start_with_system: false,
            close_to_tray: true,
            default_skin: "ninjoy".into(),
            ports: PortsSetting::default(),
        }
    }
}

impl Settings {
    pub fn clamped(mut self) -> Self {
        self.hold_seconds = self.hold_seconds.clamp(HOLD_MIN, HOLD_MAX);
        self
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Saved {
    pub settings: Settings,
    /// numbers of the controllers the player created, ascending
    pub controllers: Vec<u16>,
}

/// `app.json` in the app's data folder; a missing or broken file means defaults.
pub struct Store {
    path: PathBuf,
    pub saved: Saved,
}

impl Store {
    pub fn open(dir: &Path) -> Self {
        let path = dir.join("app.json");
        let saved = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| match serde_json::from_str::<Saved>(&text) {
                Ok(saved) => Some(saved),
                Err(error) => {
                    tracing::warn!(%error, path = %path.display(), "ignoring the saved app state");
                    None
                }
            })
            .unwrap_or_default();
        Self { path, saved }
    }

    pub fn remember(&mut self, number: u16) {
        if let Err(at) = self.saved.controllers.binary_search(&number) {
            self.saved.controllers.insert(at, number);
            self.save();
        }
    }

    pub fn forget(&mut self, number: u16) {
        if let Ok(at) = self.saved.controllers.binary_search(&number) {
            self.saved.controllers.remove(at);
            self.save();
        }
    }

    pub fn remembers(&self, number: u16) -> bool {
        self.saved.controllers.binary_search(&number).is_ok()
    }

    pub fn set_settings(&mut self, settings: Settings) {
        self.saved.settings = settings;
        self.save();
    }

    fn save(&self) {
        let write = || -> std::io::Result<()> {
            if let Some(dir) = self.path.parent() {
                std::fs::create_dir_all(dir)?;
            }
            // write then rename, so a crash never leaves half a file
            let tmp = self.path.with_extension("json.tmp");
            std::fs::write(&tmp, serde_json::to_vec_pretty(&self.saved)?)?;
            std::fs::rename(&tmp, &self.path)
        };
        if let Err(error) = write() {
            tracing::warn!(%error, path = %self.path.display(), "could not save the app state");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn custom(secure: u16, plain: u16) -> PortsSetting {
        PortsSetting {
            mode: PortsMode::Custom,
            secure,
            plain,
        }
    }

    #[test]
    fn settings_without_ports_load_as_automatic() {
        let saved: Saved =
            serde_json::from_str(r#"{ "settings": { "holdSeconds": 30 } }"#).unwrap();
        assert_eq!(
            saved.settings.ports,
            PortsSetting {
                mode: PortsMode::Automatic,
                secure: 443,
                plain: 80
            }
        );
        let json = serde_json::to_value(&saved.settings).unwrap();
        assert_eq!(
            json["ports"],
            serde_json::json!({ "mode": "automatic", "secure": 443, "plain": 80 })
        );
    }

    #[test]
    fn custom_ports_are_validated() {
        assert_eq!(custom(9443, 9080).validate(), Ok(()));
        assert_eq!(custom(9443, 9443).validate(), Err(PortsError::Same));
        assert_eq!(custom(0, 9080).validate(), Err(PortsError::OutOfRange));
        assert_eq!(custom(9443, 0).validate(), Err(PortsError::OutOfRange));
        assert_eq!(custom(65535, 1).validate(), Ok(()));
        let automatic = PortsSetting {
            mode: PortsMode::Automatic,
            secure: 0,
            plain: 0,
        };
        assert_eq!(automatic.validate(), Ok(()));
    }

    #[test]
    fn port_lists_follow_the_mode() {
        let auto = PortsSetting::default();
        assert_eq!(auto.secure_ports(&[443, 8443]), [443, 8443]);
        assert_eq!(auto.plain_ports(&[80, 8080]), [80, 8080]);
        assert_eq!(custom(9443, 9080).secure_ports(&[443, 8443]), [9443]);
        assert_eq!(custom(9443, 9080).plain_ports(&[80, 8080]), [9080]);
    }

    #[test]
    fn the_lowest_wanted_port_below_1024() {
        assert_eq!(PortsSetting::default().wanted_low_port(), Some(80));
        assert_eq!(custom(9443, 9080).wanted_low_port(), None);
        assert_eq!(custom(443, 9080).wanted_low_port(), Some(443));
        assert_eq!(custom(443, 80).wanted_low_port(), Some(80));
    }
}
