//! LAN-only rules and the addresses phones can use to reach this PC.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// True for addresses that can only come from the local network (or this PC).
pub fn is_lan(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_lan_v4(v4),
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => is_lan_v4(v4),
            None => is_lan_v6(v6),
        },
    }
}

fn is_lan_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    ip.is_private() // 10/8, 172.16/12, 192.168/16
        || ip.is_loopback()
        || ip.is_link_local() // 169.254/16
        || (a == 100 && (64..128).contains(&b)) // 100.64/10 (carrier-grade NAT, some home routers)
}

fn is_lan_v6(ip: Ipv6Addr) -> bool {
    let first = ip.segments()[0];
    ip.is_loopback()
        || (first & 0xfe00) == 0xfc00 // unique local fc00::/7
        || (first & 0xffc0) == 0xfe80 // link-local fe80::/10
}

/// Names of adapters that phones cannot reach (virtual machines, containers, VPN-less tunnels).
const VIRTUAL_ADAPTERS: [&str; 7] = [
    "vethernet",
    "virtualbox",
    "vmware",
    "docker",
    "wsl",
    "hyper-v",
    "loopback",
];

/// IPv4 addresses of the network interfaces phones are likely to reach, best first.
pub fn reachable_addresses() -> Vec<Ipv4Addr> {
    let Ok(interfaces) = if_addrs::get_if_addrs() else {
        return Vec::new();
    };
    let mut found: Vec<Ipv4Addr> = interfaces
        .into_iter()
        .filter(|i| {
            let name = i.name.to_lowercase();
            !VIRTUAL_ADAPTERS.iter().any(|v| name.contains(v))
                && !name.starts_with("veth")
                && !name.starts_with("br-")
        })
        .filter_map(|i| match i.ip() {
            IpAddr::V4(v4) if is_lan_v4(v4) && !v4.is_loopback() && !v4.is_link_local() => Some(v4),
            _ => None,
        })
        .collect();
    // home networks first
    found.sort_by_key(|ip| (!matches!(ip.octets(), [192, 168, ..]), *ip));
    found.dedup();
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn local_addresses_are_accepted() {
        for s in [
            "10.0.0.5",
            "172.16.1.1",
            "172.31.255.255",
            "192.168.0.10",
            "100.64.0.1",
            "169.254.3.4",
            "127.0.0.1",
            "::1",
            "fd12:3456::1",
            "fe80::1",
            "::ffff:192.168.1.2",
        ] {
            assert!(is_lan(ip(s)), "{s}");
        }
    }

    #[test]
    fn public_addresses_are_refused() {
        for s in [
            "8.8.8.8",
            "172.32.0.1",
            "100.128.0.1",
            "1.1.1.1",
            "2001:4860::8888",
            "::ffff:8.8.8.8",
        ] {
            assert!(!is_lan(ip(s)), "{s}");
        }
    }
}
