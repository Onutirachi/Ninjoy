# Implementation Plan: Virtual DualShock 4 Backend

**Branch**: `feat/20261020-174310-virtual-ds4-backend` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

A new library crate `host/devices` (`ninjoy-devices`) turns session slots into virtual
DualShock 4 pads: a pure report encoder, a backend boundary with a Windows (ViGEmBus) and a Linux
(UHID) backend, and a hub that implements the session's `StateSink`, plugs and unplugs pads from
session events, resends reports at 250 Hz and forwards rumble/lightbar to the session. The
developer host uses it by default. Details in [research.md](research.md).

## Technical Context

**Language/Version**: Rust 2024 (workspace rust-version 1.88).
**Primary Dependencies**: `ninjoy-session` (path), `vigem-rust` 0.2 (Windows only, MIT/Apache),
`tracing`; Linux uses `std::fs::File` on `/dev/uhid` (no new crate). Dev: `tokio` for hub tests;
Linux integration test reads evdev through `/dev/input` with plain file reads.
**Testing**: `cargo test` (unit + hub tests on every OS), Linux UHID integration test in CI
(`sudo` for `/dev/uhid` and `/dev/input`), Windows ViGEm test `#[ignore]` run locally.
**Performance Goals**: < 1 ms backend time per state (p95); 250 ± 10 reports/s per pad with 8 pads.
**Constraints**: GPL-compatible dependencies; no code outside a backend depends on a driver.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Fidelity | Pass | DS4 with touchpad (2 touches + click), motion, rumble/lightbar; backend boundary with two backends. |
| II. Zero-install | Pass | Phones unchanged; Linux needs no driver; missing driver degrades with guidance. |
| III. Latency | Pass | Reports submitted on the state's task; no allocation per report; measured. |
| IV. Skins | Pass | Not affected. |
| V. Tested | Pass | Encoder vectors, hub tests with a test backend, real UHID test in CI, ViGEm test locally. |
| VI. Simplicity | Pass | One encoder for both transports; one pump thread; the only abstraction is the backend boundary the constitution asks for. |

## Design

- **`ds4.rs`**: `Ds4Pad` keeps the per-pad clock (timestamp ticks, 6-bit counter, touch tracking
  ids and packet counter) and builds `[u8; 64]` from a `ControllerState` (`report(&state, now)`);
  stick/trigger/button/d-pad/touch/motion mapping as in research R1; gyro off → zero rates and
  1 g on Y. `parse_output(&[u8]) -> Option<Feedback>` for output report 0x05 (Linux); feature
  report bytes for 0x02/0x12/0xa3.
- **`backend.rs`**: `trait Backend: Send + Sync { fn name(&self) -> &str; fn plug(&self, slot: u16, feedback: FeedbackSender) -> Result<Box<dyn Pad>, DeviceError>; }`
  and `trait Pad: Send { fn submit(&mut self, report: &[u8; 64]) -> Result<(), DeviceError>; }`
  (drop = unplug). `open_default() -> Result<Box<dyn Backend>, Unavailable>` picks the platform
  backend; `Unavailable { reason, fix }` carries the message.
- **`vigem.rs`** (Windows): maps the 64 bytes into `Ds4ReportEx`; notifications → feedback.
- **`uhid.rs`** (Linux): create/input/destroy events, reader thread for output and feature
  requests.
- **`hub.rs`**: `DeviceHub` implements `StateSink`; slots → `PadEntry { pad, ds4, last_state,
  status }`. `on_state` plugs on first use, encodes and submits; `attach(session)` follows
  `SlotCreated` (plug), `Freed` (unplug) and forwards feedback to `session.send_feedback`; a pump
  thread resubmits every pad each 4 ms (deadline scheduling). `status(slot)` and
  `availability()` for the slot list; per-slot failures are logged and kept in the status.
- **Developer host**: `--no-devices` flag; `list` shows each slot's pad status; `input <n>` and
  `feedback` toggle per-slot printing; startup prints the backend or the unavailability reason.

## Project Structure

```text
host/devices/Cargo.toml
host/devices/src/{lib.rs, ds4.rs, backend.rs, hub.rs, vigem.rs, uhid.rs}
host/devices/tests/{ds4.rs, hub.rs, uhid.rs, vigem.rs}
host/devhost/src/main.rs        uses ninjoy-devices
Cargo.toml                       workspace member host/devices
.github/workflows/ci.yml         uhid access for the Linux integration test
docs/research/virtual-ds4-prototype.md   updated with what the backend confirms
```
