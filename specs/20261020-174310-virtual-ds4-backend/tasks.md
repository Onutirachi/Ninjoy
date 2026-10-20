# Tasks: Virtual DualShock 4 Backend

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md). Tests are written before the code they cover.

## Setup

- [ ] T001 Crate `host/devices` (`ninjoy-devices`) in the workspace, with `vigem-rust` for Windows only

## Foundational - report encoder and backend boundary

- [ ] T002 [P] Unit tests in `host/devices/tests/ds4.rs`: byte layout of report 0x01 for buttons, d-pad (8 directions + neutral), sticks, triggers, PS/touchpad click, counter wrap at 64, timestamp ticks, gyro/accel units and the one-to-one motion mapping, gyro off = flat, two touches with tracking ids and packet counter, output report 0x05 parsing, feature reports 0x02/0x12/0xa3 sizes and calibration values
- [ ] T003 `host/devices/src/ds4.rs` and `host/devices/src/backend.rs` (`Backend`, `Pad`, `DeviceError`, `Unavailable`, feedback sender)

## US1/US5 - Hub (Windows path first) (P1)

- [ ] T004 [P] Hub tests in `host/devices/tests/hub.rs` with a recording test backend and a real session on random ports: pad plugged on a host-created slot and on a phone's first state, same pad through a reconnect, unplugged when freed, neutral state reported on loss, 250 ± 10 reports/s per pad with 8 pads, backend time < 1 ms p95, a failing plug isolated to its slot, feedback forwarded to the right slot
- [ ] T005 `host/devices/src/hub.rs` (`DeviceHub`: `StateSink`, `attach(session)`, pump thread, statuses)
- [ ] T006 [US1] `host/devices/src/vigem.rs` and an ignored test `host/devices/tests/vigem.rs` (plugs a pad, submits, unplugs)

## US2 - Linux (P1)

- [ ] T007 [US2] Integration test `host/devices/tests/uhid.rs` (Linux, skipped without access to `/dev/uhid`): the kernel creates the gamepad, motion and touchpad devices; a cross press and a gyro value come out of evdev; output report → feedback
- [ ] T008 [US2] `host/devices/src/uhid.rs`; CI grants access to `/dev/uhid` and the input devices for the test

## US3 - Feedback (P2)

- [ ] T009 [US3] Feedback from both backends through the hub (covered by T004 and T007; ViGEm notifications in T006)

## US4/US5 - Availability and developer host (P2/P3)

- [ ] T010 [US4] `open_default()` reasons and fixes (ViGEmBus missing with its download page; `/dev/uhid` access with the udev rule); hub keeps the session running without a backend; test for the unavailable path
- [ ] T011 [US5] `host/devhost/src/main.rs`: backend by default, `--no-devices`, plug/unplug/failure prints, `list` with pad status, `input <n>` and `feedback` toggles

## Polish

- [ ] T012 Run on Windows with a phone in Steam (inputs, motion, rumble path), update `docs/research/virtual-ds4-prototype.md`, mark the spec Implemented
