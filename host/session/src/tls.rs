//! The per-install self-signed certificate that lets browsers use motion sensors and fullscreen.

use std::net::{IpAddr, Ipv4Addr};
use std::path::{Path, PathBuf};

const CERT_FILE: &str = "cert.pem";
const KEY_FILE: &str = "key.pem";

/// A certificate and its private key, PEM encoded.
#[derive(Clone, Debug)]
pub struct Certificate {
    pub cert_pem: String,
    pub key_pem: String,
}

/// Where Ninjoy keeps its files (`%APPDATA%\Ninjoy\data`, `~/.local/share/ninjoy`).
pub fn default_data_dir() -> PathBuf {
    directories::ProjectDirs::from("", "", "Ninjoy")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::env::temp_dir().join("ninjoy"))
}

/// Loads the certificate kept in `dir`, or creates and saves a new one on first run (or when the
/// files are missing or unreadable). Keeping the same certificate means a phone that accepted
/// it once is not warned again.
pub fn load_or_create(
    dir: &Path,
    local_name: &str,
    ips: &[Ipv4Addr],
) -> std::io::Result<Certificate> {
    if let Some(existing) = load(dir) {
        return Ok(existing);
    }
    let created = generate(local_name, ips).map_err(std::io::Error::other)?;
    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join(CERT_FILE), &created.cert_pem)?;
    std::fs::write(dir.join(KEY_FILE), &created.key_pem)?;
    tracing::info!(dir = %dir.display(), "created the HTTPS certificate");
    Ok(created)
}

fn load(dir: &Path) -> Option<Certificate> {
    let cert_pem = std::fs::read_to_string(dir.join(CERT_FILE)).ok()?;
    let key_pem = std::fs::read_to_string(dir.join(KEY_FILE)).ok()?;
    let looks_valid = cert_pem.contains("BEGIN CERTIFICATE") && key_pem.contains("PRIVATE KEY");
    looks_valid.then_some(Certificate { cert_pem, key_pem })
}

fn generate(local_name: &str, ips: &[Ipv4Addr]) -> Result<Certificate, rcgen::Error> {
    let mut names = vec![format!("{local_name}.local"), "localhost".to_owned()];
    names.extend(ips.iter().map(|ip| ip.to_string()));
    let mut params = rcgen::CertificateParams::new(names)?;
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "Ninjoy");
    params
        .distinguished_name
        .push(rcgen::DnType::OrganizationName, "Ninjoy (this PC)");
    params.not_before = rcgen::date_time_ymd(2026, 1, 1);
    params.not_after = rcgen::date_time_ymd(2046, 1, 1);
    params
        .subject_alt_names
        .push(rcgen::SanType::IpAddress(IpAddr::V4(Ipv4Addr::LOCALHOST)));
    let key = rcgen::KeyPair::generate()?; // ECDSA P-256
    let cert = params.self_signed(&key)?;
    Ok(Certificate {
        cert_pem: cert.pem(),
        key_pem: key.serialize_pem(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ninjoy-tls-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn created_on_first_run_and_reused_later() {
        let dir = temp_dir("reuse");
        let first = load_or_create(&dir, "ninjoy", &[Ipv4Addr::new(192, 168, 0, 10)]).unwrap();
        assert!(first.cert_pem.contains("BEGIN CERTIFICATE"));
        let second = load_or_create(&dir, "ninjoy", &[]).unwrap();
        assert_eq!(
            first.cert_pem, second.cert_pem,
            "the same certificate is kept"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn regenerated_when_unreadable() {
        let dir = temp_dir("broken");
        let first = load_or_create(&dir, "ninjoy", &[]).unwrap();
        std::fs::write(dir.join(CERT_FILE), "garbage").unwrap();
        let second = load_or_create(&dir, "ninjoy", &[]).unwrap();
        assert_ne!(first.cert_pem, second.cert_pem);
        assert!(second.cert_pem.contains("BEGIN CERTIFICATE"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
