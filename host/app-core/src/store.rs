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
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::Auto,
            language: Language::Auto,
            hold_seconds: 60,
            phones_can_create: true,
            start_with_system: false,
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
