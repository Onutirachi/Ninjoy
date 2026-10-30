# Tasks: Linux Setup Button and Port Choice

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
Tests are written before the code they cover (constitution V).

## Phase 1: Setup

No new crate, dependency or CI step.

## Phase 2: Foundational (blocks the stories)

Port setting, server restart and the setup module's pure parts. US1 and US3 both need them.

- [ ] T001 [P] Tests in `host/app-core/src/store.rs` (unit). `PortsSetting`:
  - an `app.json` without `ports` loads as `{ mode: "automatic", secure: 443, plain: 80 }`;
  - `validate()` refuses the same port for both (`PortsError::Same`) and a port outside 1–65535
    (`PortsError::OutOfRange`; 0 is out of range);
  - port lists: Automatic → `[443, 8443]` / `[80, 8080]`; Custom → `[secure]` / `[plain]`;
  - `wanted_low_port()`: Automatic → `Some(80)`; Custom 9443/9080 → `None`; Custom 443/9080 →
    `Some(443)`.
- [ ] T002 Implement `PortsSetting` (`mode`: `"automatic"` | `"custom"`, `secure`, `plain`;
  serde camelCase, `#[serde(default)]`) as `Settings.ports` in `host/app-core/src/store.rs`.
  Make `AppCore::start` build `SessionConfig.secure_ports`/`plain_ports` from it in
  `host/app-core/src/core.rs`.
- [ ] T003 [P] Tests in `host/session/src/slots.rs` (unit), for `open_all_held(until)`:
  - it turns every Connected or Held slot into `Held { until, open: true }` and clears its
    connection;
  - Waiting slots are unchanged;
  - a later `leave(number, old_conn, …)` returns false;
  - `join` gives an open-held slot to any device (`resumed: false`);
  - an open hold expires like a normal hold.
- [ ] T004 Implement the open hold in `host/session/src/slots.rs`:
  - add `open: bool` to `SlotStatus::Held`, and update every match (`host/session/src`,
    `host/app-core/src/core.rs`);
  - add `open_all_held`;
  - in `join`, accept any device for an open hold.
- [ ] T005 [P] Tests in `host/session/tests/session.rs`, with `restart_servers`:
  - with ports 0 (any free port): the new `addresses()` differ;
  - a connected test client is closed, and its slot becomes an open hold with the same number;
  - a second client with another device id joins that number;
  - no `Freed` event is emitted;
  - with a port held by another listener: the call returns `StartError::Bind` naming the port,
    and the session still answers on the previous ports.
- [ ] T006 Implement `Session::restart_servers(secure_ports, plain_ports) -> Result<Addresses, StartError>`
  in `host/session/src/lib.rs`:
  - move the tasks, the stop signal, the announcement and the addresses into a `Servers` value
    behind a mutex, and change `addresses()` to return a clone;
  - follow the steps in research R7: open holds (`grace` from `Shared`), `neutralize` each pad,
    close the connections with a new `Control::Close` (a normal close, not the kicked screen),
    stop, bind the new ports, fall back to the previous ports on error, announce again;
  - add `Control::Close` in `host/session/src/shared.rs` and `host/session/src/connection.rs`.
- [ ] T007 [P] Tests in `host/app-core/src/setup.rs` (unit, all platforms), for the script and
  the manual commands built from a list of missing items, matching
  [contracts/system.md](contracts/system.md):
  - each block prints `ninjoy-item <id> ok|failed <reason>`;
  - the script has no `set -e`;
  - the ports block uses the lowest wanted port and never a value above the current one;
  - firewall: ufw lines for 7 ranges × (S/tcp, P/tcp, 5353/udp), with delete lines for the
    record's old ports; firewalld rich rules per active zone, then `--reload`;
  - the manual commands are the same commands prefixed with `sudo`;
  - result parsing: `ninjoy-item` lines map to `done`/`failed` with the reason, and an item
    without a line is `failed` ("no result").
- [ ] T008 [P] Tests in `host/app-core/src/setup.rs` (unit, all platforms) for the parsers:
  - the effective persisted `net.ipv4.ip_unprivileged_port_start` from fake `sysctl.d` folders
    (the same file name in an earlier folder wins; name order; `/etc/sysctl.conf` last);
  - `ENABLED=yes` in `ufw.conf`;
  - `firewall-cmd --get-active-zones` output to zone names;
  - Ninjoy rich rules recognized in `--list-rich-rules` output;
  - `modules.builtin` containing `uhid`.
- [ ] T009 In `host/devices/src/uhid.rs`, add:
  - `UDEV_RULE_FILE = "/etc/udev/rules.d/71-ninjoy-uhid.rules"`;
  - `MODULES_LOAD_FILE = "/etc/modules-load.d/ninjoy.conf"`;
  - `TOUCHPAD_RULE` (copy the exact text proven on the CachyOS test PC, see research R2);
  - `TOUCHPAD_RULE_FILE = "/etc/udev/rules.d/72-ninjoy-touchpad.rules"`;
  - `can_open() -> bool`.

  Update `open()`'s `Unavailable.fix` to point to the Configure button.
- [ ] T010 Create `host/app-core/src/setup.rs` (exported from `lib.rs`):
  - the types `SetupItem`, `SetupView`, `SetupRecord` as in [data-model.md](data-model.md),
    serde camelCase;
  - script and manual commands generation; result parsing; the parsers;
  - `linux-setup.json` read and write (`{ "ufw": { "secure", "plain" } | null }`).

  Rule texts come from `ninjoy_devices::uhid` (T009).

**Checkpoint**: `cargo test --workspace` passes; ports and restart work from code.

## Phase 3: User Story 1 - Configure Linux with one button (P1) 🎯 MVP

**Goal**: missing items listed; one Configure with one password applies them all; controllers
appear without a restart.

**Independent test**: quickstart "Linux PC", steps 1–4 and 6–8.

- [ ] T011 [P] [US1] Tests in `host/devices/tests/hub.rs`, with a fake backend:
  - a hub created with `Err(Unavailable)` reports `backend_name() == None`;
  - after `set_backend(fake, &[1, 2])`, slots 1 and 2 are `Plugged`, `unavailable()` is `None`,
    and the next `on_state` reaches the fake pad (the pump runs);
  - a second `set_backend` is ignored.
- [ ] T012 [US1] Implement `DeviceHub::set_backend(backend, slots: &[u16])` in
  `host/devices/src/hub.rs`:
  - `backend` in a `OnceLock<Box<dyn Backend>>`;
  - `unavailable` in a `Mutex<Option<…>>`;
  - start the pump thread on the first backend;
  - call `ensure` for each slot.

  Update `backend_name()`, `unavailable()` and `on_state`.
- [ ] T013 [US1] Implement the Linux check in `host/app-core/src/setup.rs`
  (`#[cfg(target_os = "linux")] pub fn check(ports: &PortsSetting, record: &SetupRecord) -> Vec<SetupItem>`),
  following research R1–R4:
  - **controllers**: `uhid::can_open()`, plus our rule file content, plus the modules-load file
    or `uhid` built in;
  - **touchpad**: rule file content;
  - **ports**: only when `wanted_low_port()` is some; runtime `/proc` value and persisted value
    ≤ the port;
  - **firewall**: firewalld (`firewall-cmd --state`, zones, rich rules), or ufw (`ufw.conf`,
    `systemctl is-active ufw`, record matches the ports), or no item.

  The whole check targets under 300 ms. On other systems it returns an empty list.
- [ ] T014 [US1] Implement `configure()` in `host/app-core/src/setup.rs` (Linux):
  - build the script for the missing items and run `pkexec /bin/sh -c <script>`;
  - map exit 126 → `outcome: "cancelled"`; exit 127 with "No authentication agent", or a spawn
    error → `"noPrompt"`;
  - otherwise parse the item lines;
  - write `linux-setup.json` when the ufw firewall item succeeded;
  - check again, retrying the controllers item for up to 2 s;
  - `failed` items keep their reason and commands.
- [ ] T015 [US1] Wire it into `host/app-core/src/core.rs`:
  - `AppCore::setup_check()` and `AppCore::setup_configure()` return the view (and
    `portsMoved`);
  - when the hub has no backend and the controllers item is done, call `open_default()` and
    `hub.set_backend(…, &session slot numbers)`;
  - after Configure in Automatic mode, if low ports are now allowed and the plain port is not
    80, call `restart_servers` with the Automatic lists;
  - `Snapshot.setup`: the last view on Linux (a first check at start), `None` on Windows;
  - `changed()` after each.
- [ ] T016 [P] [US1] Tests in `host/app-core/tests/core.rs`: the snapshot has `setup: null` off
  Linux (`#[cfg(not(target_os = "linux"))]`); the snapshot's `settings.ports` defaults.
- [ ] T017 [US1] Add the Tauri commands `setup_check` and `setup_configure` in
  `host/app/src/main.rs`. Run `setup_configure` on a blocking thread
  (`tauri::async_runtime::spawn_blocking`), because pkexec waits for the user.
- [ ] T018 [P] [US1] UI tests in `desktop/test/browser/app.test.ts`, with the fake bridge:
  - the chip warns while `driver.ok` is false;
  - opening the panel calls `setupCheck`;
  - missing items are listed with their explanations and one Configure button;
  - after Configure, done/failed are shown, with each failed item's reason and commands;
  - `cancelled` shows the cancelled message;
  - `noPrompt` shows all commands with a copy button;
  - with every item done there is no Configure button and the panel says "ready";
  - `portsMoved` shows the moved notice;
  - on Windows (`setup: null`) the panel is as today.
- [ ] T019 [US1] Implement it in the desktop window:
  - types and calls in `desktop/src/bridge.ts`;
  - the status panel in `desktop/src/app.ts` (the driver popover);
  - styles in `desktop/src/styles.css`;
  - strings in `desktop/src/i18n/en.json` and `pt.json`: item titles and one-line explanations
    (the touchpad note: "applies to controllers plugged after the setup"), Configure, ready,
    cancelled, no prompt, copy, moved notice, and the firewall help for an unknown firewall.

**Checkpoint**: Configure works end to end on the CachyOS PC.

## Phase 4: User Story 2 - The touchpad stays inside the game (P1)

**Goal**: Ninjoy's touchpads never move the pointer; real pads untouched.

**Independent test**: quickstart "Linux PC", step 5, plus a real DS4/DualSense plugged in.

- [ ] T020 [US2] On the CachyOS PC, check that `TOUCHPAD_RULE` (T009) matches the proven rule
  with `udevadm info` on a Ninjoy touchpad event node. Check that a real DS4/DualSense touchpad
  does not match (its `uniq` is not `02:4e:4a:*`). Adjust `host/devices/src/uhid.rs` if needed.
- [ ] T021 [US2] Manual check after Configure: slide on the touchpad. The pointer does not move,
  and Steam Input still reports the touchpad (record the result in `handoff.md`).

## Phase 5: User Story 3 - Choose the ports (P2)

**Goal**: Automatic/Custom ports; changing them moves only the phone server right away, with a
notice.

**Independent test**: quickstart "Ports", steps 1–4.

- [ ] T022 [P] [US3] Tests in `host/app-core/tests/core.rs`, with test ports:
  - `update_settings` with new valid ports restarts the servers, the snapshot shows the new
    ports, `portsMoved: true`, and controllers keep their numbers;
  - invalid ports → `Err`, and settings and session are unchanged;
  - a taken port → `Err` naming it, previous ports running, previous setting saved;
  - an unchanged ports setting → `portsMoved: false`.
- [ ] T023 [US3] Change `AppCore::update_settings` to return
  `Result<SettingsResult { ports_moved }, String>` in `host/app-core/src/core.rs`:
  - validate;
  - call `restart_servers` when `ports` changed;
  - on error keep the previous setting.

  Update `set_settings` in `host/app/src/main.rs` to return it.
- [ ] T024 [P] [US3] UI tests in `desktop/test/browser/app.test.ts`:
  - the Ports row shows Automatic / Custom;
  - Custom shows the secure and plain inputs and Save;
  - invalid input shows the reason inline and does not call the bridge;
  - a bridge error shows the port and reason, and the inputs go back to the running setting;
  - success shows the moved notice.
- [ ] T025 [US3] Implement the Ports row in the settings popover (`desktop/src/app.ts`), with
  validation mirroring T001, the strings in `desktop/src/i18n/en.json` and `pt.json`, and styles
  in `desktop/src/styles.css`.

## Phase 6: User Story 4 - One Ninjoy at a time (P3)

**Goal**: a second start brings the first window forward; a crashed copy never blocks.

**Independent test**: quickstart "Single copy".

The behavior already exists in `host/app-core/src/channel.rs` (research R9); this story only
adds the missing test and the manual check.

- [ ] T026 [P] [US4] Tests in `host/app-core/tests/channel.rs` (`#[cfg(unix)]`): a socket file
  left by a dead listener does not block `channel::serve`, and a following `send("show")` reaches
  it.
- [ ] T027 [US4] Manual: start the app twice, 10 times on Windows and on Linux; then kill it
  (`kill -9` / Task Manager) and start it again (record the result in `handoff.md`).

## Phase 7: Polish

- [ ] T028 [P] Rewrite the Linux section of `README.md`:
  - what the Configure button changes;
  - how to undo each item by hand (from [contracts/system.md](contracts/system.md) "Undo");
  - the Ports setting.

  Remove the "ports 80/443 need permission" note.
- [ ] T029 Run [quickstart.md](quickstart.md) on the CachyOS PC (ufw) and on Windows.
  - On firewalld: run it on a firewalld distribution if one is available, or note it as not
    tested.
  - Remove the CachyOS manual fixes first.
  - Remind the maintainer to delete `/etc/sudoers.d/90-claude-test` when the Linux tests end.
- [ ] T030 `cargo fmt`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `npm run typecheck`, `npm test`. Then mark the spec Implemented and update `handoff.md`.

## Dependencies

- Phase 2 blocks every story. Within it:
  - T001→T002;
  - T003→T004→T005→T006;
  - T007/T008/T009→T010.
- US1 (T011–T019) needs T002, T006, T009 and T010.
- US2 needs US1's Configure, to apply the rule on a real PC.
- US3 (T022–T025) needs T002 and T006 only, so it can run in parallel with US1.
- US4 is independent.

## Parallel examples

- Phase 2: T001, T003, T007 and T008 together (separate files or modules).
- US1: T011, T016 and T018 together; then T012, T013/T014 and T019.
- US3 next to US1: T022 and T024 together.

## Implementation strategy

1. **MVP**: Phase 2 + US1. Linux users get controllers with one button, and Windows is
   unchanged.
2. Add US3 (Ports), then confirm US2 and US4 on real machines.
3. Polish: README and the full quickstart run.

Commit after the maintainer validates each step.
