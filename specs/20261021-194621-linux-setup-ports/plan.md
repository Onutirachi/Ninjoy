# Implementation Plan: Linux Setup Button and Port Choice

**Branch**: `feat/20261021-194621-linux-setup-ports` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

## Summary

On Linux the app checks four setup items without privileges (controller permission, touchpad
rule, port permission, firewall opening). One Configure button runs a generated shell script
through `pkexec` (one password prompt). The same script, prefixed with `sudo`, is what the
panel shows when no password prompt is available. When the controller permission appears, the
device hub receives its backend at runtime and plugs pads for the existing controllers, with no
restart.

A new Ports setting (Automatic or Custom) is stored with the other settings. Changing it, or the
setup allowing low ports in Automatic mode, restarts only the phone servers inside the session:
- the slot table and the virtual pads stay;
- controllers that had a phone are held open to any phone, because the page's new address gives
  it a new identity;
- the window shows a short notice that phones must scan the QR code again.

The single running copy already exists (the local channel); this feature adds tests for the
stale socket on Linux.

## Technical Context

**Language/Version**: Rust 2024 (workspace, 1.88+), TypeScript + Vite (`desktop`).

**Primary Dependencies**: no new crates. Linux tools called as external programs: `pkexec`
(polkit), `udevadm`, `modprobe`, `sysctl`, `ufw`, `firewall-cmd`. Uses `std::process::Command`,
`serde`/`serde_json`, which are already in the workspace.

**Storage**:
- `app.json` gains `settings.ports`.
- `linux-setup.json` in the data folder records what the setup applied to ufw (its rules are
  readable only by root).
- System files written by the setup script:
  - `/etc/udev/rules.d/71-ninjoy-uhid.rules`
  - `/etc/udev/rules.d/72-ninjoy-touchpad.rules`
  - `/etc/modules-load.d/ninjoy.conf`
  - `/etc/sysctl.d/99-ninjoy.conf`
  - firewall rules

**Testing**:
- Unit tests (all platforms):
  - port validation and the port lists;
  - setup script and manual commands generation;
  - sysctl and `ufw.conf` parsing;
  - the slot table's open hold.
- Session integration tests: restarting the servers keeps the slots, moves the ports, falls back
  on a taken port.
- Hub tests: a backend given later plugs the existing slots.
- Channel tests: second copy and stale socket.
- Desktop browser tests (Vitest + fake bridge): setup panel, Configure results, Ports setting,
  moved notice.
- Manual checks on CachyOS (ufw) and, when possible, on a firewalld distribution. The system
  changes need root, so CI cannot run them.

**Target Platform**: Windows (Ports setting only) and Linux (Ports setting and setup).

**Project Type**: desktop app (Tauri) with a Rust core.

**Performance Goals**: the check runs when the panel opens and finishes in under 300 ms (file
reads plus at most two short commands). Restarting the servers takes under 1 s. Nothing touches
the input path.

**Constraints**:
- No root process stays running.
- Nothing on the system changes without the button.
- No user-facing text outside locale files: Rust returns item ids and raw reasons, and the window
  translates.

**Scale/Scope**: one PC and its LAN.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Real controller fidelity, backend boundary | The UHID rule texts live in `ninjoy_devices::uhid_rules` and the uhid check in `ninjoy_devices::uhid`. The hub only gains "receive a backend later". The touchpad rule matches Ninjoy's MAC prefix (`02:4e:4a`), so real pads are untouched. | Pass |
| II. Zero-install, LAN-only | Phones still need only a browser. The firewall opening is limited to the same ranges `net::is_lan` accepts. Nothing leaves the LAN. | Pass |
| III. Latency | No change to the input path. A server restart closes connections once; pads stay plugged with a neutral state. | Pass |
| IV. Skins | Not touched. | Pass |
| V. Spec-driven and tested | Spec clarified; every requirement maps to a test or to a manual check in [quickstart.md](quickstart.md). | Pass |
| VI. Simplicity | No new dependency or abstraction. The script is plain text built by one function (it is both what runs and what the user reads). | Pass |
| i18n | New window strings in `desktop/src/i18n/en.json` and `pt.json`. | Pass |

Post-design re-check: still passes. The design adds one session method (`restart_servers`), one
hub method (`set_backend`), one slot state flag (open hold) and one app-core module (`setup`).

## Project Structure

### Documentation (this feature)

```text
specs/20261021-194621-linux-setup-ports/
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── bridge.md        # window ↔ app commands
│   └── system.md        # files, rules and commands the setup writes
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
host/session/src/
├── lib.rs        # Session splits into the kept part (Shared) and Servers; restart_servers()
└── slots.rs      # Held { until, open }: an open hold takes any device; open_all_held()
host/devices/src/
├── hub.rs        # backend in a OnceLock; set_backend() starts the pump and plugs existing slots
├── uhid.rs       # can_open() (used by the setup check)
└── uhid_rules.rs # rule texts, file paths and module name (every platform: the script is tested everywhere)
host/app-core/src/
├── store.rs      # Settings.ports (PortsSetting), validation
├── core.rs       # ports → SessionConfig, apply ports (restart), setup view in the snapshot
└── setup.rs      # NEW: items, check (Linux), script/manual commands, run via pkexec, results
host/app/src/main.rs   # commands: setup_check, setup_configure; set_settings returns a result
desktop/src/
├── bridge.ts     # types and calls
├── app.ts        # status panel with setup items + Configure; Ports in settings; notice
├── i18n/en.json, i18n/pt.json
└── styles.css
desktop/test/browser/app.test.ts
host/session/tests/session.rs, host/devices/tests/hub.rs, host/app-core/tests/{core,channel}.rs
README.md         # Linux section: what the setup does and how to undo it by hand
```

**Structure Decision**: no new crate. The setup logic sits in `app-core`, next to the settings it
depends on. Its system calls are behind `#[cfg(target_os = "linux")]`, and its pure parts
(script, parsing) compile and are tested on every platform.

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| Restart only the servers (session split) | Spec FR-010: games must never see pads unplugged | Restarting the whole session drops the slot table, which frees the slots and unplugs every pad |
| Open hold on port change | SC-004: the phone gets its number back, but at a new address the browser gives it a new device id | A normal hold waits for the old device id, so the phone would see "controller in use" |
