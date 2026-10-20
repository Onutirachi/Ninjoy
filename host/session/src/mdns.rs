//! Announces `ninjoy.local` on the network (mDNS), picking a free variant when another host
//! already uses the name.

use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr};
use std::time::Duration;

use mdns_sd::{HostnameResolutionEvent, ServiceDaemon, ServiceInfo};

const SERVICE_TYPE: &str = "_ninjoy._tcp.local.";
/// How long to listen for another host answering for a name before taking it.
const PROBE: Duration = Duration::from_secs(1);
const MAX_TRIES: u32 = 9;

/// `base`, then `base-2`, `base-3`… — the first one `taken` says is free.
pub fn choose_name(base: &str, mut taken: impl FnMut(&str) -> bool) -> Option<String> {
    (1..=MAX_TRIES)
        .map(|n| {
            if n == 1 {
                base.to_owned()
            } else {
                format!("{base}-{n}")
            }
        })
        .find(|name| !taken(name))
}

/// Keeps the announcement alive; withdrawn when dropped.
pub(crate) struct Announcement {
    daemon: ServiceDaemon,
    fullname: String,
    /// e.g. "ninjoy.local"
    pub host: String,
}

impl Drop for Announcement {
    fn drop(&mut self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}

/// Starts announcing; blocking (probes the network), so call it from a blocking task.
pub(crate) fn announce(base: &str, ips: &[Ipv4Addr], port: u16) -> Result<Announcement, String> {
    if ips.is_empty() {
        return Err("no network address to announce".into());
    }
    let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
    let ours: HashSet<IpAddr> = ips.iter().map(|ip| IpAddr::V4(*ip)).collect();
    let taken = |name: &str| -> bool {
        let Ok(events) =
            daemon.resolve_hostname(&format!("{name}.local."), Some(PROBE.as_millis() as u64))
        else {
            return false;
        };
        while let Ok(event) = events.recv_timeout(PROBE + Duration::from_millis(200)) {
            match event {
                HostnameResolutionEvent::AddressesFound(_, found) => {
                    if found.iter().any(|ip| !ours.contains(&ip.to_ip_addr())) {
                        return true; // another machine answers for this name
                    }
                }
                HostnameResolutionEvent::SearchTimeout(_)
                | HostnameResolutionEvent::SearchStopped(_) => break,
                _ => {}
            }
        }
        false
    };
    let name = choose_name(base, taken).ok_or("every name variant is taken")?;
    let host = format!("{name}.local.");
    let addresses: Vec<IpAddr> = ips.iter().map(|ip| IpAddr::V4(*ip)).collect();
    let info = ServiceInfo::new(SERVICE_TYPE, &name, &host, &addresses[..], port, None)
        .map_err(|e| e.to_string())?;
    let fullname = info.get_fullname().to_owned();
    daemon.register(info).map_err(|e| e.to_string())?;
    Ok(Announcement {
        daemon,
        fullname,
        host: format!("{name}.local"),
    })
}

#[cfg(test)]
mod tests {
    use super::choose_name;

    #[test]
    fn takes_the_first_free_variant() {
        assert_eq!(choose_name("ninjoy", |_| false).as_deref(), Some("ninjoy"));
        assert_eq!(
            choose_name("ninjoy", |n| n == "ninjoy").as_deref(),
            Some("ninjoy-2")
        );
        assert_eq!(
            choose_name("ninjoy", |n| n == "ninjoy" || n == "ninjoy-2").as_deref(),
            Some("ninjoy-3")
        );
        assert_eq!(choose_name("ninjoy", |_| true), None);
    }
}
