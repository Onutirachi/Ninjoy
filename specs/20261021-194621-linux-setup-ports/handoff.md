# Handoff: Linux Setup Button and Port Choice

**Updated**: 2026-10-30 | **Spec**: [spec.md](spec.md) | **Branch**: `feat/20261021-194621-linux-setup-ports`

## State

Spec, plan and [tasks.md](tasks.md) (30 tasks) approved, committed and pushed. Phase 2
(T001–T010) is implemented, validated and committed. It passes the full CI set on Windows and
on the Ubuntu 26.04 test VM (see `drafts/HANDOFF.md` for access).

## Done in the last session

- `/speckit-analyze`: no critical issue. Applied: the commands are also shown when the password
  prompt is cancelled (FR-007, contract and T018); a pure `should_move_to_low_ports` with a unit
  test (T015/T016); a UI test for the unknown-firewall help (T018). Left as is: no automated test
  of hiding the ports item (C4), and the chip warning on any `driver.ok == false` (I1).
- Phase 2:
  - `PortsSetting` in `store.rs`. Automatic uses the session config's port lists (port 0 in
    tests), Custom exactly the chosen ports.
  - Open hold (`Held { until, open }`) in `slots.rs`; the controller list shows it as waiting.
  - `Session::restart_servers`: a taken port is refused before anything is touched (probe
    bind), and the servers go back to the previous ports if binding still fails. The mDNS name
    is re-registered with the new port, without probing again. `Control::Close` closes pages
    normally.
  - `ninjoy_devices::uhid_rules` (every platform) holds the rule texts; `uhid::can_open()`.
  - `app-core/src/setup.rs`: types, script, manual commands, result parsing, parsers, record.

## Decisions

- One button for everything (pkexec, one password). The script it runs is also what the panel
  shows as manual commands.
- Controller permission: a udev `uaccess` rule (whoever is at the local session) plus `uhid` in
  modules-load.
- Firewall: ufw or firewalld, open only to the ranges `net::is_lan` accepts, for the ports and
  mDNS. ufw rules cannot be read without root, so `linux-setup.json` records them.
- Ports below 1024: `net.ipv4.ip_unprivileged_port_start` in `/etc/sysctl.d/99-ninjoy.conf`.
- A port change restarts only the phone servers, right away, with a notice. The slots and pads
  stay. Controllers that had a phone become an "open hold" for any phone, because a new port is
  a new origin (new device id, and the player's settings on the phone start fresh).
- No undo in the app; the README documents it.
- The checks run at start, after Configure and each time the status panel opens.

## Open questions

- The CachyOS PC is out of service: `TOUCHPAD_RULE` uses the contract's text, not compared
  with the file proven there. T020 checks it on the Ubuntu VM instead.

- None blocking. Ideas for later specs:
  - "Player profiles", next after this spec: named profiles on the phone, exported and imported
    as a file. Details in `drafts/HANDOFF.md`. When it lands, the port-change notice recommends
    exporting, and the page is told the host moved.
  - Steam Cloud sync for the Steam build (skins and preferences only).

## Next step

Phase 3 (US1, T011–T019). The Ubuntu VM has nothing set up yet: test Configure there.
