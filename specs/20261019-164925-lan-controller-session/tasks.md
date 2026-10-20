# Tasks: LAN Controller Session v1

**Input**: Design documents from `specs/20261019-164925-lan-controller-session/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/protocol.md](contracts/protocol.md),
[contracts/host-core-api.md](contracts/host-core-api.md), [quickstart.md](quickstart.md)

**Tests**: Required by the constitution (principle V): every acceptance scenario gets an
automated test, written before the implementation it covers.

**Format**: `[ID] [P?] [Story] Description` — `[P]` = can run in parallel (different files, no
dependency on unfinished tasks).

## Phase 1: Setup

- [X] T001 Create the Cargo workspace `Cargo.toml` at the repository root (`members = ["host/session", "host/devhost"]`, edition 2024, `rust-version = "1.85"`, `license = "GPL-3.0-only"`, shared `[workspace.dependencies]` with the versions of research R14) and add `target/` to `.gitignore`
- [X] T002 [P] Create crate `host/session` (`ninjoy-session`, library) with empty modules `protocol`, `state`, `slots`, `connection`, `server`, `tls`, `mdns`, `net`, `device` in `host/session/src/`
- [X] T003 [P] Create crate `host/devhost` (`ninjoy-devhost`, binary) depending on `ninjoy-session` in `host/devhost/src/main.rs`
- [X] T004 [P] Add `assets/brand/` with the one-color logos from `drafts/logo/` (`logo-full.svg`, `logo-ninja.svg`, `logo-word.svg`, CorelDRAW metadata stripped, fill `currentColor`) and `assets/brand/LICENSE.md` ("Copyright © 2026 Ninjoy, all rights reserved; not covered by the GPL, see TRADEMARKS.md")
- [X] T005 [P] Add `@fontsource-variable/manrope` and `@fontsource/chakra-petch` to `controller/package.json`; add a second Vite entry `controller/explain.html` in `controller/vite.config.ts` (`build.rollupOptions.input`)
- [X] T006 Update `.github/workflows/ci.yml` job `test`: install the stable Rust toolchain (`dtolnay/rust-toolchain`, components rustfmt + clippy), cache cargo, run `npm run build --workspace @ninjoy/controller`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: wire format on both sides, the slot table, a plain HTTP + WebSocket server that
serves the page, the LAN filter and the page's basic session client.

### Tests

- [X] T007 [P] Write `host/session/tests/vectors.json`: one entry per message type of [contracts/protocol.md](contracts/protocol.md) (HELLO, STATE without touches, STATE with 2 touches + motion, HIDDEN, LIST, PONG, WELCOME, IN_USE, OPENED_ELSEWHERE, KICKED, VERSION_MISMATCH, FEEDBACK rumble-only / lightbar-only / both, SLOT_LIST with 3 entries, PING) with decoded fields and expected bytes in hex
- [X] T008 [P] Rust test `host/session/tests/protocol.rs`: encode and decode every vector; malformed lengths and unknown types are rejected/ignored as specified; sequence comparison with wrap-around
- [X] T009 [P] TS unit test `controller/test/unit/protocol.test.ts`: reads `host/session/tests/vectors.json`; encode/decode every vector; `ControllerState` → STATE conversion (sticks ×32767, triggers ×255, touches ×65535, button bit order, motion only with gyro on); encoding reuses one buffer
- [X] T010 [P] Rust unit tests in `host/session/src/slots.rs`: lowest free number; create/create_at/remove waiting slots; join by number, by 0 (new controller), refused when phones may not create; same device replaces older connection; another device gets in-use; held slot resumed by the same device; freed numbers reused; slot list snapshot and change version
- [X] T011 [P] Rust unit tests in `host/session/src/net.rs`: private IPv4/IPv6 ranges accepted (10/8, 172.16/12, 192.168/16, 100.64/10, 169.254/16, 127/8, fc00::/7, fe80::/10, ::1, IPv4-mapped), public addresses refused

### Implementation

- [X] T012 [P] `host/session/src/protocol.rs`: message enums and allocation-free encode into a caller buffer / decode from `&[u8]`, `PROTOCOL_VERSION = 1`
- [X] T013 [P] `host/session/src/state.rs`: `ControllerState`, `Touch`, `Motion`, `ControllerState::NEUTRAL` per [contracts/host-core-api.md](contracts/host-core-api.md)
- [X] T014 [P] `controller/src/engine/protocol.ts`: page-side codec (HELLO, STATE from `ControllerState`, HIDDEN, LIST, PONG; decode of every host message)
- [X] T015 `host/session/src/slots.rs`: slot table (`BTreeMap<u16, Slot>`), statuses Waiting/Connected/Held, transitions of [data-model.md](data-model.md), clock passed in for testability, change counter for SLOT_LIST updates
- [X] T016 [P] `host/session/src/net.rs`: LAN address filter and listing of reachable interface addresses (if-addrs; skip loopback, link-local and virtual adapters for display)
- [X] T017 [P] `host/session/src/device.rs`: User-Agent → `DeviceSummary` (model or OS + browser) with unit tests for Android Chrome, iPhone Safari, iPad, desktop Chrome/Edge/Firefox
- [X] T018 `host/session/src/server.rs` + `lib.rs`: `Session::start` with `SessionConfig`, plain HTTP server (axum) on the plain port: static files from rust-embed / `web_root`, `/` and `/<n>` → `index.html` (temporary until US5 adds the explanation page), `/ws` upgrade; peers outside the LAN closed before handling; `StateSink` trait; `events()` broadcast; `shutdown`
- [X] T019 `host/session/src/connection.rs`: per-connection task — HELLO deadline 5 s, version check, join through the slot table, decode STATE into a reused struct, drop stale sequences, call the sink on the task
- [X] T020 [P] `controller/src/platform/device-id.ts`: 16 random bytes in `localStorage['ninjoy.v1.device']` (hex), new identity when storage is unavailable
- [X] T021 `controller/src/platform/session.ts`: connect to `/ws` (wss on https pages, ws on http), HELLO with the slot from the URL, WELCOME → `history.replaceState` to `/<n>`, send STATE on every `subscribe` callback with one reused buffer, status callbacks for the UI
- [X] T022 `host/devhost/src/main.rs`: start the session with defaults, print addresses, log events with tracing, stdin commands `list`, `quit`; options `--port`, `--plain-port`, `--grace`, `--name`, `--web`
- [X] T023 `controller/src/main.ts`: start the session client after `createController`; `controller/src/ui/dev-panel.ts` shows connection status and slot number

**Checkpoint**: `cargo run -p ninjoy-devhost`, open `http://<pc-ip>:8080/` on a phone, press buttons: states reach the host.

---

## Phase 3: User Story 1 - Join as a controller and play (Priority: P1) 🎯 MVP

**Goal**: numbered slots, the controller list at `/`, states for every change.

**Independent Test**: two phones join from the list and by `/n`; the host prints each slot's states.

- [X] T024 [P] [US1] Rust integration test `host/session/tests/session.rs` (plain WebSocket clients): HELLO 0 → slot 1, second → 2; slots 1 and 3 used → new gets 2; `/4` free → 4; `create_slot` → waiting 3 taken by HELLO 3; `remove_slot` frees it; `create_slot_at(7)`; LIST → SLOT_LIST now and after every change; phones-can-create off → HELLO 0 refused, SLOT_LIST flag cleared; every STATE reaches the sink in order with the right slot
- [X] T025 [P] [US1] Browser test `controller/test/browser/session.test.ts` (mock WebSocket server through Vitest browser commands): HELLO carries the URL slot and device id; WELCOME rewrites the URL to `/<n>`; each state change sends one STATE; the controller list renders waiting/in-use/held-for-me entries, updates on SLOT_LIST, joins on tap, hides "new controller" when not allowed
- [X] T026 [US1] Waiting slots and controller list in `host/session/src/slots.rs`, `connection.rs` and `lib.rs`: `create_slot`, `create_slot_at`, `remove_slot`, `set_phones_can_create`, LIST/SLOT_LIST with live updates (wake listing connections on table changes), HELLO 0 = new controller
- [X] T027 [US1] `controller/src/ui/lobby.ts`: controller list page for `/` (cards for waiting controllers, in-use shown disabled, "back to controller N" first, "new controller" button), live updates, join → session HELLO; texts in `controller/src/i18n/en.json` and `pt.json`
- [X] T028 [US1] Show the slot number briefly on join and in the player menu (`controller/src/ui/menu.ts`, `controller/src/ui/screens.ts` toast)
- [X] T029 [US1] devhost commands `create [n]`, `remove <n>`, `watch <n>` (print states) in `host/devhost/src/main.rs`

**Checkpoint**: MVP — phones join and play over plain HTTP.

---

## Phase 4: User Story 2 - Never stuck, always back (Priority: P1)

**Independent Test**: hold a button, drop Wi-Fi, come back within 60 s.

- [X] T030 [P] [US2] Rust timer tests in `host/session/tests/session.rs` with short timeouts in the config (real time is simpler than a paused clock with real sockets): no message for 1 s → sink gets NEUTRAL + `Disconnected`, slot Held; HELLO from the same device within 60 s → `Reconnected`, same slot; after 60 s → `Freed` and number reusable; HIDDEN → NEUTRAL immediately, next STATE resumes; close → NEUTRAL; out-of-order STATE dropped; 250 ms idle resends keep the slot alive
- [X] T031 [P] [US2] Browser test additions in `controller/test/browser/session.test.ts`: idle resend every 250 ms; `visibilitychange` hidden → HIDDEN; connection drop → reconnect 250 ms doubling to 4 s while visible, stops while hidden; reload keeps `/<n>` and rejoins the same slot
- [X] T032 [US2] Loss timeout, grace timer, HIDDEN, close handling and neutral-before-event ordering in `host/session/src/connection.rs` and `slots.rs`
- [X] T033 [US2] Keepalive, HIDDEN, reconnect backoff and "host not available, trying again" status in `controller/src/platform/session.ts`

---

## Phase 5: User Story 3 - Slot already in use and kicks (Priority: P2)

**Independent Test**: open `/1` on a second phone; kick a phone from the devhost.

- [X] T034 [P] [US3] Rust integration tests in `host/session/tests/session.rs`: another device asking for a connected or held slot → IN_USE, first device unaffected; same device second connection → older gets OPENED_ELSEWHERE and closes; `kick` → KICKED, NEUTRAL, `Kicked` + `Freed`, slot immediately reusable
- [X] T035 [P] [US3] Browser test additions: IN_USE → "controller in use" with "see controllers" (opens the list); OPENED_ELSEWHERE → notice with "use here"; KICKED → "disconnected by the host", no automatic reconnect, "join again" works
- [X] T036 [US3] IN_USE, OPENED_ELSEWHERE and `kick` in `host/session/src/connection.rs`, `slots.rs`, `lib.rs`; devhost command `kick <n>`
- [X] T037 [US3] Page handling of IN_USE, OPENED_ELSEWHERE, KICKED and VERSION_MISMATCH ("update needed") in `controller/src/platform/session.ts` and `controller/src/main.ts`

---

## Phase 6: User Story 4 - Feedback from the game (Priority: P2)

**Independent Test**: `rumble 1 1 0` / `light 1 #ff0000` from the devhost.

- [X] T038 [P] [US4] Rust integration tests: `send_feedback` reaches the connected page as FEEDBACK (rumble only, lightbar only, both); ignored for waiting/held slots; PING every 1 s, PONG → `SlotInfo.rtt`, next PING carries the last RTT
- [X] T039 [P] [US4] TS unit test `controller/test/unit/rumble.test.ts`: intensity → pulse pattern (`max(strong, weak) × 100` ms per 100 ms cycle), zero → stop
- [X] T040 [P] [US4] Browser test additions: FEEDBACK rumble → vibration stub called with the pulse pattern and stopped on zero, on hidden and on disconnect; no vibration support → one notice; lightbar → `--ninjoy-lightbar` on the root and shown in the dev panel; PONG answered; RTT shown in the dev panel
- [X] T041 [US4] Feedback channel per connection (bounded mpsc), `send_feedback`, PING/PONG and RTT in `host/session/src/connection.rs` and `lib.rs`; devhost commands `rumble <n> <strong> <weak>`, `light <n> <#rrggbb>`
- [X] T042 [US4] Rumble pulses, lightbar property, PONG and RTT display in `controller/src/platform/session.ts`, `controller/src/platform/vibration.ts`, `controller/src/ui/dev-panel.ts`

---

## Phase 7: User Story 5 - Secure page for motion and fullscreen (Priority: P2)

**Independent Test**: plain address → explanation → secure controller with gyro.

- [X] T043 [P] [US5] Rust tests: `host/session/src/tls.rs` generates cert + key on first run, reuses them later, regenerates when unreadable; integration test connects over `wss` with a test verifier trusting the generated certificate; port fallback when 443/80 are taken (bind a blocker first)
- [X] T044 [P] [US5] Browser test `controller/test/browser/explain.test.ts`: explanation page in en and pt; "Open controller" points to `https://<host>/<n>`; "Continue without motion sensors" points to `http://<host>/<n>?plain`
- [X] T045 [US5] `host/session/src/tls.rs` (rcgen, ECDSA P-256, SANs `ninjoy.local`, `localhost`, LAN IPs, 10 years, PEM in the data dir via `directories`) and the secure server (axum-server rustls) with 443 → 8443 / 80 → 8080 fallback in `host/session/src/server.rs`
- [X] T046 [US5] Plain server routes: `/` and `/<n>` → `explain.html` unless `?plain`; assets and `/ws` on both servers
- [X] T047 [US5] `controller/explain.html` + `controller/src/ui/explain.ts`: translated explanation (Android and iPhone steps), the two links, same look as the notices

---

## Phase 8: User Story 6 - Easy addresses (Priority: P3)

**Independent Test**: open `ninjoy.local/1` on a phone; run two hosts.

- [X] T048 [P] [US6] Rust test in `host/session/src/mdns.rs`: name selection picks `ninjoy`, then `ninjoy-2`, `ninjoy-3` when a resolver stub reports the previous names taken (verified on Windows: `Resolve-DnsName ninjoy.local` → the PC's IP)
- [X] T049 [US6] `host/session/src/mdns.rs`: announce the host name and `_ninjoy._tcp` with mdns-sd, 1 s probe for conflicts, unregister on shutdown; `Session::addresses()` returns the name and the reachable IPs; devhost prints both secure and plain addresses

---

## Phase 9: User Story 7 - Branded opening and notice screens (Priority: P3)

**Independent Test**: watch the splash; trigger each notice; turn a phone upright.

- [X] T050 [P] [US7] Browser test `controller/test/browser/screens.test.ts`: splash runs about 1.5 s and never delays an already joined controller; every status of [data-model.md](data-model.md) shows its notice with the logo, message and buttons; portrait on a 390×844 viewport shows "turn the device sideways", portrait on 820×1180 does not; no external requests (fonts and images served locally)
- [X] T051 [US7] `controller/src/ui/screens.ts` + styles in `controller/src/ui/styles.css`: splash (fade in, quick zoom to a very large size while fading out), notice component (one-color logo, pulsing message, buttons), slowly moving background pattern of NINJOY wordmarks (the maintainer preferred the wordmark alone), depth tokens of the host prototype; fonts imported from the fontsource packages
- [X] T052 [US7] Portrait-phone notice (shortest side < 600 CSS px) and lobby/explanation pages using the same component; all texts in `controller/src/i18n/en.json` and `pt.json`

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T053 [P] Performance test `host/session/tests/perf.rs` (`#[ignore]`): 32 clients × 120 states/s for 10 s, p95 decode-to-sink < 1 ms (SC-002, SC-007); run in release locally and record the result in the PR
- [ ] T054 [P] Update `README.md`: repository layout (`host/`, `assets/brand/`), `cargo run -p ninjoy-devhost`, firewall note
- [ ] T055 [P] Update `TRADEMARKS.md` to point to `assets/brand/` as the location of the logo files
- [ ] T056 Run every scenario of [quickstart.md](quickstart.md), including the phone steps (Android and iPhone), and fix gaps
- [ ] T057 Mark completed tasks here and set **Status** to "Implemented" in [spec.md](spec.md)

---

## Dependencies & Execution Order

- **Setup → Foundational → stories.** T006 (CI) can land with the first Rust code.
- **US1** needs the foundation. **US2** and **US3** build on US1's join flow. **US4** needs a
  connected page (US1). **US5** adds the secure server and the explanation page on top of the
  foundation's plain server. **US6** is independent of US2–US5. **US7** styles the screens
  that US1–US5 introduce (the earlier stories use plain placeholder screens).
- **Polish** after all stories.

## Parallel Examples

- Foundation tests T007–T011 together; then T012, T013, T014, T016, T017, T020 together.
- US1: T024 and T025 together, then T026 → T027.
- US4: T038, T039, T040 together.

## Implementation Strategy

1. **MVP (Phases 1–3)**: phones join over plain HTTP from the list or by number and the
   devhost prints their states — testable with real phones (without gyro).
2. **Robustness (US2, US3)**: no stuck inputs, reconnects, in-use and kicks.
3. **Feedback and security (US4, US5)**: rumble/lightbar, HTTPS with the certificate → gyro.
4. **Polish (US6, US7)**: `ninjoy.local`, splash and branded screens.
