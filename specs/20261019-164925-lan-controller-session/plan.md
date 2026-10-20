# Implementation Plan: LAN Controller Session v1

**Branch**: `feat/20261019-164925-lan-controller-session` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261019-164925-lan-controller-session/spec.md`

## Summary

Connect the controller page to the PC. A new Rust library, `ninjoy-session`, runs the host's
network core: it serves the built controller page over HTTPS (per-install self-signed
certificate) and plain HTTP (explanation page and a no-motion fallback), announces
`ninjoy.local`, allocates numbered slots (lowest free, waiting slots, grace period,
kick), and exchanges compact binary WebSocket messages with each page: full controller
states from the page (on every change plus a 250 ms keepalive) and rumble/lightbar feedback
from the host. Decoded states go synchronously to a pluggable `StateSink`, the boundary the
virtual device backend will implement next. A development binary, `ninjoy-devhost`, runs the
core from a terminal so the whole path can be tested with real phones. On the page, a session
client sends the existing touch-engine state, and a splash plus branded notice screens cover
every connection status.

## Technical Context

**Language/Version**: Rust 1.85+ (edition 2024; developed with 1.99) for the host; TypeScript
7 + Vite 8 for the page (existing `controller/` app); Node.js 26.

**Primary Dependencies**: tokio, axum, axum-server (rustls), rcgen, mdns-sd, if-addrs,
directories, rust-embed, mime_guess, tracing (see [research.md](research.md) R14); page:
@fontsource-variable/manrope, @fontsource/chakra-petch (OFL fonts).

**Storage**: certificate and key PEM files in the app data directory; device identity in the
page's localStorage. No database.

**Testing**: `cargo test` (unit, integration with real WebSocket/TLS clients, paused-clock
timers, ignored performance test); Vitest 5 unit tests and browser tests (Playwright/Chromium)
for the page client; shared protocol test vectors.

**Target Platform**: host on Windows 10+ and Linux (x86-64); page on current Android Chrome,
iOS Safari, desktop Chromium (development).

**Project Type**: Rust library + development CLI in a new Cargo workspace (`host/`), plus
changes to the existing web app (`controller/`).

**Performance Goals**: decode-to-sink p95 < 1 ms with 32 clients × 120 states/s (SC-002,
SC-007); touch-to-sink p95 < 20 ms on home Wi-Fi (SC-003, measured through RTT); neutral state
within 1.2 s of a loss (SC-004).

**Constraints**: LAN only, no outbound connections; no per-message allocations on the decode
path; HTTPS required for motion sensors; no internet for assets (fonts embedded).

**Scale/Scope**: tens of simultaneous controllers (no fixed cap); ~2–3k lines of Rust,
~1k lines of TypeScript.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Real controller fidelity | Pass | Carries every DS4 input incl. 2 touches + click and motion; feedback path for rumble and lightbar. The `StateSink` trait is where the device-backend boundary plugs in; no driver code here. |
| II. Zero-install, LAN-only | Pass | Browser only; `ninjoy.local` with IP fallback; peers outside private ranges refused; no outbound traffic; iPhone fallback without motion; notices for unsupported vibration. |
| III. Latency is a requirement | Pass | Budgets stated (SC-002/003/004) and measured (perf test, RTT in the dev panel); binary state-based messages with sequence numbers; decode into reused structures, direct sink call. |
| IV. Declarative, safe skins | Pass | Not affected; the page keeps the bundled official skin. |
| V. Spec-driven and tested | Pass | Each acceptance scenario maps to Rust or browser tests; manual quickstart for real Wi-Fi/vibration; CI runs Rust and TS tests. |
| VI. Simplicity | Pass | Two crates; the only new abstraction is `StateSink` (the device-backend boundary the constitution allows). Every dependency justified in research R14. |
| Tech constraints | Pass | Rust host (Tauri later reuses the tokio core); HTTPS with per-install self-signed certificate; mDNS + IP; numbered slots, lowest free, reconnect, in-use screen, kick. |
| i18n | Pass | All player-visible text (screens, explanation page) in the page's en/pt catalogs; host logs in English. |
| Licensing | Pass | Dependencies MIT/Apache/BSD; fonts OFL; brand assets outside the GPL under `assets/brand/` per TRADEMARKS.md. |

Post-design re-check: still passing.

## Project Structure

### Documentation (this feature)

```text
specs/20261019-164925-lan-controller-session/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R14 decisions
├── data-model.md        # slots, transitions, page statuses
├── quickstart.md        # automated + phone validation
├── contracts/
│   ├── protocol.md      # wire protocol v1
│   └── host-core-api.md # ninjoy-session public API
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
Cargo.toml                     # [workspace] members = ["host/session", "host/devhost"]
host/
├── session/                   # crate ninjoy-session (library)
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs             # Session, SessionConfig, public types
│   │   ├── protocol.rs        # message types, encode/decode (no allocation)
│   │   ├── state.rs           # ControllerState, NEUTRAL
│   │   ├── slots.rs           # slot table, allocation, transitions (pure, clock injected)
│   │   ├── connection.rs      # per-WebSocket task: handshake, timers, sink calls
│   │   ├── server.rs          # axum routes, secure + plain servers, static files
│   │   ├── tls.rs             # certificate load/generate (rcgen)
│   │   ├── mdns.rs            # ninjoy.local announcement, conflict fallback
│   │   ├── net.rs             # LAN address filter, interface listing
│   │   └── device.rs          # User-Agent → DeviceSummary
│   └── tests/
│       ├── vectors.json       # shared protocol test vectors
│       ├── protocol.rs
│       ├── session.rs         # integration: real clients over ws and wss
│       └── perf.rs            # #[ignore] SC-002/SC-007
└── devhost/                   # crate ninjoy-devhost (binary)
    └── src/main.rs            # args, address printout, stdin commands
assets/brand/                  # one-color logo SVGs (not GPL, see TRADEMARKS.md)
controller/
├── explain.html               # plain-address explanation page (second Vite entry)
├── src/
│   ├── engine/protocol.ts     # codec (pure)
│   ├── platform/session.ts    # WebSocket client, reconnect, keepalive, HIDDEN, rumble
│   ├── platform/device-id.ts  # localStorage identity
│   ├── ui/screens.ts          # splash + notice screens (+ portrait-phone notice)
│   ├── ui/explain.ts          # explanation page script
│   ├── ui/dev-panel.ts        # + connection status, slot, RTT, lightbar
│   ├── i18n/{en,pt}.json      # + screen texts
│   └── main.ts                # wires controller + session + screens
└── test/
    ├── unit/protocol.test.ts  # reads host/session/tests/vectors.json
    ├── unit/rumble.test.ts
    └── browser/session.test.ts # mock WebSocket server via Vitest browser commands
.github/workflows/ci.yml       # + Rust toolchain, fmt, clippy, cargo test, controller build
```

**Structure Decision**: The host gets its own Cargo workspace members under `host/`, matching
the constitution's Rust host; the library/binary split lets the Tauri app (next features)
embed the same core. The page changes stay inside the existing `controller/` app. Brand
assets get a top-level `assets/brand/` folder so their separate license is obvious.

## Complexity Tracking

No constitution violations to justify.
