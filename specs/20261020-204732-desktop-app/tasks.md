# Tasks: Desktop App

**Input**: [spec.md](spec.md), [plan.md](plan.md). Tests are written before the code they cover.

## Setup

- [ ] T001 `host/app` crate (Tauri 2, binary `ninjoy`), `desktop/` npm workspace (Vite + TS), icons from the brand ninja, CI packages for the Linux web view and the desktop build

## Foundational - core, store and channel

- [ ] T002 [P] Tests `host/app/tests/core.rs`: create (next/chosen number), remove, kick errors, snapshot fields (addresses, driver, controllers with pad status), saved controllers persisted and recreated at start (taken numbers skipped), settings persisted and applied (hold time to the session, phones may create)
- [ ] T003 `host/app/src/store.rs`, `host/app/src/core.rs`; `Session::set_grace` in `host/session`
- [ ] T004 [P] Tests `host/app/tests/channel.rs`: request/response over the channel, `list` lines, errors with non-zero client exit, "not running" when nobody listens, second start sends `show`
- [ ] T005 `host/app/src/channel.rs` (named pipe / Unix socket) and `host/app/src/cli.rs`

## US1/US2 - Window: list, details, live view (P1)

- [ ] T006 [P] UI tests `desktop/test/browser/`: empty state, create selects the new controller with QR and addresses, states (waiting, connected with device/latency, reconnecting with countdown), kick/remove actions, live view follows a state (buttons, sticks, triggers, touches), motion view on/off, latency now/average/peak and 60 s graph, lightbar and vibration in the details
- [ ] T007 `desktop/src/{bridge,list,details,titlebar}.ts`, styles ported from the prototype, i18n en/pt
- [ ] T008 Tauri shell `host/app/src/main.rs`: commands, `changed` events, custom title bar, QR SVG

## US3 - Tray, autostart, single copy (P2)

- [ ] T009 Tray (open/quit), close to tray with a one-time notice, autostart with `--tray`, single copy through the channel, splash (`desktop/src/splash.ts`)

## US4 - Command line (P2)

- [ ] T010 `ninjoy create|remove|kick|list` end to end (covered by T004; manual check with the window)

## US5/US6 - Settings, skins, driver guidance (P2/P3)

- [ ] T011 [P] UI tests: settings apply at once (theme live, language, hold time, phones may create, start with the computer); skins tab lists the official skin with import "coming soon"; driver chip opens the reason and fix
- [ ] T012 `desktop/src/{settings,skins}.ts` and the driver chip

## Polish

- [ ] T013 Run on Windows (and Linux when available) with phones; screenshots light/dark; mark the spec Implemented
