//! The skin library phones choose from: the official skins shipped with Ninjoy (embedded) and
//! the skins installed in a folder (one subfolder per skin id). The page validates every skin
//! it loads with the skin format rules; here a skin only needs a readable `skin.json` of a
//! format this version knows, and the app can mark skins broken after its own validation.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rust_embed::RustEmbed;
use serde_json::{Value, json};

use crate::shared::lock;

/// The official skins (`skins/` at the repository root). Debug builds read them from disk.
#[derive(RustEmbed)]
#[folder = "../../skins"]
#[allow_missing = true]
struct Bundled;

/// The skin used when nothing else is chosen or available.
pub const OFFICIAL: &str = "ninjoy";
/// Skin formats this version knows.
const FORMATS: [u64; 2] = [1, 2];
/// Largest skin (all files), like the skin format's package limit.
const MAX_BYTES: u64 = 20 * 1024 * 1024;

/// One skin in the library.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SkinEntry {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub format: u8,
    /// every file, '/'-separated, relative to the skin
    pub files: Vec<String>,
    /// shipped with Ninjoy (cannot be removed)
    pub bundled: bool,
    /// why phones are not offered this skin, if so
    pub broken: Option<String>,
}

/// A skin id: lowercase letters, digits and dashes (also its folder name).
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !id.starts_with('-')
}

/// A relative file path inside a skin, refusing anything that could leave its folder.
fn safe_path(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && !path.contains(':')
        && path
            .split('/')
            .all(|p| !p.is_empty() && p != "." && p != "..")
}

pub(crate) struct Library {
    dir: Option<PathBuf>,
    default: Mutex<String>,
    /// broken skins found by the app's validation, with the reason
    broken: Mutex<HashMap<String, String>>,
}

impl Library {
    pub fn new(dir: Option<PathBuf>) -> Self {
        Self {
            dir,
            default: Mutex::new(OFFICIAL.to_owned()),
            broken: Mutex::new(HashMap::new()),
        }
    }

    /// Every skin, official first, then installed ones by id; broken ones say why.
    pub fn entries(&self) -> Vec<SkinEntry> {
        let mut entries = bundled_entries();
        let bundled: Vec<String> = entries.iter().map(|e| e.id.clone()).collect();
        if let Some(dir) = &self.dir {
            entries.extend(
                folder_entries(dir)
                    .into_iter()
                    .filter(|e| !bundled.contains(&e.id)),
            );
        }
        let broken = lock(&self.broken);
        for e in &mut entries {
            if e.broken.is_none()
                && let Some(reason) = broken.get(&e.id)
            {
                e.broken = Some(reason.clone());
            }
        }
        entries.sort_by_key(|e| (e.id != OFFICIAL, !e.bundled, e.id.clone()));
        entries
    }

    /// The default skin, or the official one when the chosen default is missing or broken.
    pub fn default(&self) -> String {
        let chosen = lock(&self.default).clone();
        let usable = self
            .entries()
            .iter()
            .any(|e| e.id == chosen && e.broken.is_none());
        if usable { chosen } else { OFFICIAL.to_owned() }
    }

    /// Returns whether it changed.
    pub fn set_default(&self, id: &str) -> bool {
        let mut d = lock(&self.default);
        let changed = *d != id;
        *d = id.to_owned();
        changed
    }

    /// Returns whether it changed.
    pub fn set_broken(&self, broken: HashMap<String, String>) -> bool {
        let mut b = lock(&self.broken);
        let changed = *b != broken;
        *b = broken;
        changed
    }

    /// The list phones get: usable skins and the default.
    pub fn index(&self) -> Value {
        let skins: Vec<Value> = self
            .entries()
            .into_iter()
            .filter(|e| e.broken.is_none())
            .map(|e| {
                json!({
                    "id": e.id, "name": e.name, "author": e.author, "version": e.version,
                    "format": e.format, "files": e.files,
                })
            })
            .collect();
        json!({ "default": self.default(), "skins": skins })
    }

    /// A file of a skin (official skins first, like the listing).
    pub fn read(&self, id: &str, path: &str) -> Option<Vec<u8>> {
        if !valid_id(id) || !safe_path(path) {
            return None;
        }
        if let Some(file) = Bundled::get(&format!("{id}/{path}")) {
            return Some(file.data.into_owned());
        }
        let dir = self.dir.as_ref()?;
        std::fs::read(dir.join(id).join(path)).ok()
    }
}

/// Name, author, version and format from a skin.json, or why it cannot be used.
fn describe(
    id: &str,
    manifest: Option<&[u8]>,
    files: Vec<String>,
    bundled: bool,
    size: u64,
) -> SkinEntry {
    let mut entry = SkinEntry {
        id: id.to_owned(),
        name: id.to_owned(),
        author: String::new(),
        version: String::new(),
        format: 0,
        files,
        bundled,
        broken: None,
    };
    let parsed = manifest.and_then(|bytes| serde_json::from_slice::<Value>(bytes).ok());
    match parsed {
        None if manifest.is_none() => entry.broken = Some("no skin.json".into()),
        None => entry.broken = Some("skin.json is not valid JSON".into()),
        Some(m) => {
            let text = |key: &str| {
                m.get(key)
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned()
            };
            entry.name = text("name");
            entry.author = text("author");
            entry.version = text("version");
            let format = m.get("format").and_then(Value::as_u64).unwrap_or(0);
            entry.format = format as u8;
            if !FORMATS.contains(&format) {
                entry.broken = Some(format!("format {format} is not supported by this version"));
            } else if size > MAX_BYTES {
                entry.broken = Some("the skin is larger than 20 MB".into());
            }
        }
    }
    entry
}

fn bundled_entries() -> Vec<SkinEntry> {
    let mut files: HashMap<String, Vec<String>> = HashMap::new();
    for path in Bundled::iter() {
        if let Some((id, rest)) = path.split_once('/')
            && valid_id(id)
        {
            files
                .entry(id.to_owned())
                .or_default()
                .push(rest.to_owned());
        }
    }
    files
        .into_iter()
        .map(|(id, mut list)| {
            list.sort();
            let manifest = Bundled::get(&format!("{id}/skin.json")).map(|f| f.data.into_owned());
            let size = list
                .iter()
                .filter_map(|f| Bundled::get(&format!("{id}/{f}")))
                .map(|f| f.data.len() as u64)
                .sum();
            describe(&id, manifest.as_deref(), list, true, size)
        })
        .collect()
}

fn folder_entries(dir: &Path) -> Vec<SkinEntry> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    read.flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let id = e.file_name().into_string().ok()?;
            if !valid_id(&id) {
                return None;
            }
            let root = e.path();
            let mut files = Vec::new();
            let mut size = 0;
            walk(&root, &root, &mut files, &mut size);
            files.sort();
            let manifest = std::fs::read(root.join("skin.json")).ok();
            Some(describe(&id, manifest.as_deref(), files, false, size))
        })
        .collect()
}

fn walk(root: &Path, dir: &Path, files: &mut Vec<String>, size: &mut u64) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for e in read.flatten() {
        let path = e.path();
        if path.is_dir() {
            walk(root, &path, files, size);
        } else if let Ok(rel) = path.strip_prefix(root) {
            *size += e.metadata().map(|m| m.len()).unwrap_or(0);
            let rel: Vec<String> = rel
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect();
            files.push(rel.join("/"));
        }
    }
}
