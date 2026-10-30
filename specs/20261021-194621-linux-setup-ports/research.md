# Research: Linux Setup Button and Port Choice

## R1. Controller permission (`/dev/uhid`)

- **Decision**: a udev rule `KERNEL=="uhid", MODE="0660", TAG+="uaccess"` in
  `/etc/udev/rules.d/71-ninjoy-uhid.rules` (it must sort before `73-seat-late.rules`, which turns
  `uaccess` into an ACL for the active local session). Plus `uhid` in
  `/etc/modules-load.d/ninjoy.conf`, so the module and its device exist at boot. Applying it
  runs:
  - `modprobe uhid`
  - `udevadm control --reload`
  - `udevadm trigger --action=change --sysname-match=uhid`
  - `udevadm settle`
- **Check (no root)**: done when all three hold:
  - `/dev/uhid` opens for read and write;
  - our rule file has the expected line;
  - the module loads at boot: our modules-load file exists, or `uhid` is built in (listed in
    `/lib/modules/$(uname -r)/modules.builtin`).

  Opening alone is not enough: a manual `chmod 666` (as on the CachyOS test PC) opens now but is
  lost at reboot.
- **Rationale**: `uaccess` gives access to whoever is at the seat, at once, with no logout
  (clarification Q1). The rule text already lives in `ninjoy_devices::uhid::UDEV_RULE`.
- **Alternatives**: the `input` group (needs a logout, and is broader); `MODE="0666"` (any user,
  even remote ones).

## R2. Touchpad rule

- **Decision**: `/etc/udev/rules.d/72-ninjoy-touchpad.rules` with
  `SUBSYSTEM=="input", ATTRS{uniq}=="02:4e:4a:*", ATTRS{name}=="*Touchpad", ENV{LIBINPUT_IGNORE_DEVICE}="1"`.
  The exact text is copied from the rule proven on the CachyOS test PC during implementation.
  Apply: write the file, then `udevadm control --reload`.
- **Identity**: `ds4::mac(slot)` gives `02:4e:4a:…`. `02` is a locally administered address,
  which no real Sony controller uses, so real DS4/DualSense touchpads are not matched.
- **Limit**: libinput reads the property when a device is added. Pads already plugged when the
  rule is added keep moving the pointer until they are plugged again. In the common first run
  this does not matter: there are no pads before the controller permission exists. Noted in the
  panel's explanation for the item.
- **Check**: our file has the expected line.

## R3. Ports below 1024

- **Decision** (maintainer, 2026-10-30): the system-wide `net.ipv4.ip_unprivileged_port_start`.
  It also covers IPv6. The setup:
  - writes `/etc/sysctl.d/99-ninjoy.conf`, sorted last so a distribution file cannot override it
    at boot;
  - runs `sysctl -w`.

  The value is the lowest port Ninjoy needs, and the setup never raises an existing lower value.
- **Check (no root)**: the item is shown only when a wanted port is below 1024 (Automatic: 443
  and 80; Custom: the chosen ports). It is done when both are at most the lowest wanted port:
  - the runtime value in `/proc/sys/net/ipv4/ip_unprivileged_port_start`;
  - the value persisted for boot, as `systemd-sysctl` resolves it: files in `/etc/sysctl.d`,
    `/run/sysctl.d`, `/usr/local/lib/sysctl.d`, `/usr/lib/sysctl.d` and `/lib/sysctl.d`, where
    the same file name in an earlier folder wins and files apply in name order; then
    `/etc/sysctl.conf`.
- **Rationale**: it works at once, so the phone server can move to 443/80 right after the setup.
  It survives updates and works for any build. Podman and rootless Docker document the same
  setting.
- **Alternatives**:
  - `setcap cap_net_bind_service` on the executable. Rejected: it needs a full app restart (file
    capabilities apply at exec) and a new password after every update or rebuild, does not work
    for AppImage/Flatpak, and turns on GLib's secure mode.
  - A NAT redirect from 443 to 8443. Rejected: too complex, and the app could not tell which
    ports phones really use.

## R4. Firewall opening

- **Ranges**: the ones `ninjoy_session::net::is_lan` accepts, minus loopback:
  - IPv4: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.0.0/16`
  - IPv6: `fc00::/7`, `fe80::/10`

  Ports: the secure and plain TCP ports in use, and UDP 5353 (mDNS).
- **Which firewall** (checked in this order, without root):
  - firewalld: `firewall-cmd --state` prints `running`.
  - ufw: `/etc/ufw/ufw.conf` has `ENABLED=yes` and `systemctl is-active ufw` is `active`.
  - Neither: no item (spec edge case).
- **firewalld**:
  - One rich rule per range and port, in each active zone (`firewall-cmd --get-active-zones`),
    for example `rule family="ipv4" source address="192.168.0.0/16" port port="443" protocol="tcp" accept`.
  - Applied with `--permanent --zone=Z --add-rich-rule=…`, then `firewall-cmd --reload`.
  - Check: `firewall-cmd --zone=Z --list-rich-rules`, which polkit allows for local users without
    a password ("info" actions).
- **ufw**:
  - Rules like `ufw allow from <range> to any port <p> proto <tcp|udp> comment 'Ninjoy'`.
  - Its rules are readable only by root, so `linux-setup.json` records the applied ports.
  - Check: ufw is active and the record matches the wanted ports. A rule removed by hand is not
    detected (spec edge case).
- **Port change**: the script first removes the rules for the previously applied ports (from the
  record for ufw, from the listed rules for firewalld), then adds the new ones.
- **Alternatives**: opening the ports to any source (rejected in clarification Q2); a firewalld
  service file (still needs per-source rules).

## R5. One password prompt: `pkexec` and a generated script

- **Decision**: build one POSIX shell script with a block per missing item and run it with
  `pkexec /bin/sh -c '<script>'`. Each block prints `ninjoy-item <id> ok` or
  `ninjoy-item <id> failed <reason>` and never stops the following blocks (`set -u`, no
  `set -e`). The app reads those lines.
- **Manual commands (FR-007)**: the same blocks, each command shown with `sudo`. A single
  function produces both, so they cannot drift.
- **Exit codes**:

  | Code | Meaning | What the app does |
  |---|---|---|
  | 126 | password prompt dismissed | "cancelled" |
  | 127 | no authentication agent ("No authentication agent found") | "no prompt": show the commands |
  | — | `pkexec` missing (spawn error) | "no prompt": show the commands |
  | other | ran | per-item results from the output |
- **After a run**: the app checks again by itself. If `/dev/uhid` does not open yet, it retries
  for up to 2 s, because udev applies the ACL asynchronously.
- **Rationale**: the user can read what runs; nothing is installed for polkit; no root process
  stays running. The dialog names `/bin/sh`, which is acceptable for a one-time setup.
- **Alternatives**:
  - A helper mode of the Ninjoy binary run as root: it would need a second description of the
    commands for FR-007.
  - A polkit policy file: it cannot be installed before the first setup.

## R6. Virtual controllers without a restart (FR-005)

- **Decision**: `DeviceHub` keeps its backend in a `OnceLock`. `set_backend()`:
  - stores it;
  - clears `unavailable`;
  - starts the pump thread;
  - plugs a pad for every slot the core passes (host-created and phone-created).

  After the setup or a check, the core calls `ninjoy_devices::open_default()` again when the hub
  has no backend.
- **Rationale**: `on_state` already plugs on the next state, and waiting slots need an explicit
  plug.

## R7. Restarting the phone servers (FR-010, FR-011)

- **Decision**: `Session` keeps `Shared` (slots, live states, skins, events) and moves the
  server tasks, the stop signal, the mDNS announcement and the addresses into a `Servers` value
  behind a mutex. `restart_servers(secure_ports, plain_ports)`:
  1. Marks every slot that has a phone as an open hold (`Held { until: now + grace, open: true }`)
     and clears its connection, so the closing connections' `leave` no longer applies. It sets
     each pad to the neutral state.
  2. Closes those connections (a normal WebSocket close; the page shows its usual reconnecting
     screen).
  3. Stops the servers and the announcement.
  4. Binds the new ports.
  5. If a port cannot be bound, rebinds the previous ports and returns the error with the port
     and the reason. The app keeps the previous setting.
  6. Announces again and returns the new `Addresses`.
- **Open hold**: `join` gives an open-held slot to any device, as it does a waiting slot. It
  expires like a normal hold, and the expiry unplugs the pad (the player did not come back).
- **The phone's identity at a new address**: localStorage is per origin (scheme, host, port), so
  the device id, the player's settings and the chosen skin start fresh. The certificate warning
  may show again (browsers differ). This is documented in the spec's edge cases.
- **Notice**: `set_settings` and `setup_configure` return `portsMoved: true` when the servers
  moved. The window shows a short notice.

## R8. Port setting validation

- Custom ports: whole numbers 1–65535, different from each other. Validated in the window (to
  give the reason at once) and again in the core.
- Automatic gives `[443, 8443]` and `[80, 8080]`; Custom gives `[secure]` and `[plain]`, with no
  fallback, so a clash is reported (FR-011).
- On Windows, ports below 1024 need no permission. On Linux without the port permission, a
  Custom port below 1024 fails to bind ("permission denied"). The app keeps the previous ports,
  and the setup panel lists the port item.

## R9. Single copy (FR-013)

- Existing: `channel::serve` refuses a second copy (`AlreadyRunning`). On Unix it removes a
  socket file left by a crashed copy; on Windows, a named pipe disappears with its process.
- Add tests: a stale socket file does not block `serve`; a second `send("show")` reaches the
  first copy.
