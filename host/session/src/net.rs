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

/// Adapters phones cannot reach: virtual machines' private networks and containers. A Hyper-V
/// external switch ("vEthernet (<name>)") bridges the real network, so plain "vEthernet" is
/// only ranked lower, not dropped.
const UNREACHABLE_ADAPTERS: [&str; 6] = [
    "wsl",
    "default switch",
    "virtualbox",
    "vmware",
    "docker",
    "loopback",
];

/// Picks, from (adapter name, address) pairs, the addresses phones are likely to reach, best
/// first: physical adapters before bridged virtual ones, home networks (192.168/16) first.
pub fn pick_addresses(interfaces: &[(String, Ipv4Addr)]) -> Vec<Ipv4Addr> {
    let mut found: Vec<(bool, Ipv4Addr)> = interfaces
        .iter()
        .filter(|(name, _)| {
            let name = name.to_lowercase();
            !UNREACHABLE_ADAPTERS.iter().any(|v| name.contains(v))
                // Linux container pairs, not Windows' "vEthernet"
                && !(name.starts_with("veth") && !name.starts_with("vethernet"))
                && !name.starts_with("br-")
        })
        .filter(|(_, ip)| is_lan_v4(*ip) && !ip.is_loopback() && !ip.is_link_local())
        .map(|(name, ip)| (name.to_lowercase().contains("vethernet"), *ip))
        .collect();
    found.sort_by_key(|(virtual_adapter, ip)| {
        (
            *virtual_adapter,
            !matches!(ip.octets(), [192, 168, ..]),
            *ip,
        )
    });
    let mut ips: Vec<Ipv4Addr> = found.into_iter().map(|(_, ip)| ip).collect();
    ips.dedup();
    ips
}

/// IPv4 addresses of the network interfaces phones are likely to reach, best first.
pub fn reachable_addresses() -> Vec<Ipv4Addr> {
    let Ok(interfaces) = if_addrs::get_if_addrs() else {
        return Vec::new();
    };
    let pairs: Vec<(String, Ipv4Addr)> = interfaces
        .into_iter()
        .filter_map(|i| match i.ip() {
            IpAddr::V4(v4) => Some((i.name, v4)),
            IpAddr::V6(_) => None,
        })
        .collect();
    pick_addresses(&pairs)
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

    #[test]
    fn picks_reachable_adapters_including_a_bridged_hyper_v_switch() {
        let pairs: Vec<(String, Ipv4Addr)> = [
            ("vEthernet (WSL (Hyper-V firewall))", "172.29.144.1"),
            ("vEthernet (Default Switch)", "172.31.192.1"),
            ("vEthernet (Ethernet Bridge)", "192.168.0.10"),
            ("Ethernet 2", "10.0.0.7"),
            ("Wi-Fi", "192.168.1.20"),
            ("Docker Desktop", "192.168.65.1"),
            ("Loopback Pseudo-Interface 1", "127.0.0.1"),
            ("Wi-Fi", "8.8.8.8"),
        ]
        .into_iter()
        .map(|(n, ip)| (n.to_string(), ip.parse().unwrap()))
        .collect();
        let want: Vec<Ipv4Addr> = ["192.168.1.20", "10.0.0.7", "192.168.0.10"]
            .iter()
            .map(|s| s.parse().unwrap())
            .collect();
        assert_eq!(pick_addresses(&pairs), want);
        // only the bridge: its address is used
        assert_eq!(pick_addresses(&pairs[..3]), [want[2]]);
    }
}
