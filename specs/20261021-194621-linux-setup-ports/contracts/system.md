# Contract: what the setup changes on a Linux system

Each block runs only when its item is missing. It prints one result line:
`ninjoy-item <id> ok`, or `ninjoy-item <id> failed <reason>`.

## controllers

```sh
printf '%s\n' 'KERNEL=="uhid", MODE="0660", TAG+="uaccess"' > /etc/udev/rules.d/71-ninjoy-uhid.rules
printf 'uhid\n' > /etc/modules-load.d/ninjoy.conf
modprobe uhid
udevadm control --reload
udevadm trigger --action=change --sysname-match=uhid
udevadm settle
```

## touchpad

```sh
printf '%s\n' 'SUBSYSTEM=="input", ATTRS{uniq}=="02:4e:4a:*", ATTRS{name}=="*Touchpad", ENV{LIBINPUT_IGNORE_DEVICE}="1"' > /etc/udev/rules.d/72-ninjoy-touchpad.rules
udevadm control --reload
```

## ports (N = the lowest port needed, never above the current value)

```sh
printf 'net.ipv4.ip_unprivileged_port_start = N\n' > /etc/sysctl.d/99-ninjoy.conf
sysctl -w net.ipv4.ip_unprivileged_port_start=N
```

## firewall

Ranges: `10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 fc00::/7 fe80::/10`.
Ports: `S/tcp`, `P/tcp`, `5353/udp`.

**ufw**: first delete the previous record's rules, then:

```sh
ufw allow from <range> to any port <port> proto <tcp|udp> comment 'Ninjoy'
```

**firewalld**: for each active zone, first remove the previous Ninjoy rich rules (the ones on
other ports), then:

```sh
firewall-cmd --permanent --zone=<zone> --add-rich-rule='rule family="<ipv4|ipv6>" source address="<range>" port port="<port>" protocol="<tcp|udp>" accept'
firewall-cmd --reload
```

## Undo (README, not in the app)

- Remove the four files above.
- Run `udevadm control --reload`.
- Run `sysctl --system`.
- Delete the firewall rules: `ufw delete …` with the same arguments, or
  `firewall-cmd --permanent --remove-rich-rule=…` and then `--reload`.
