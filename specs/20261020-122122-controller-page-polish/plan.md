# Implementation Plan: Controller Page Polish

**Branch**: `feat/20261020-122122-controller-page-polish` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

Page-only changes in `controller/`: a "tap to play" gate after joining (wake lock, motion
permission, vibration allowed), double-tap-and-hold click on touchpad areas in the touch engine,
the official skin without the click buttons, the rotate notice limited to the joined controller,
a redesigned controller list, and a vibration fix.

## Technical Context

**Language/Version**: TypeScript 7, Vite 8 (existing `controller/` app).
**Primary Dependencies**: none new. Screen Wake Lock API (`navigator.wakeLock`), existing
platform adapters.
**Testing**: Vitest unit + browser tests (Playwright/Chromium); skin-format official skin test.
**Constraints**: no new dependencies; all texts in en/pt catalogs.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Fidelity | Pass | Touchpad click reported with the finger position, as a real DS4. |
| II. Zero-install | Pass | Browser features only; unsupported wake lock degrades silently. |
| III. Latency | Pass | No change to the input path. |
| IV. Skins | Pass | Click buttons stay in the format; only the official skin drops them. |
| V. Tested | Pass | Each scenario gets a test (wake lock and permission through stubs). |
| VI. Simplicity | Pass | Reuses the stick double-tap timing (`StickFingers`) pattern. |

## Design

- **Tap to play** (`controller/src/ui/start.ts`): shown by `main.ts` on the first `joined` status
  of the page load; the tap calls `platform/wake-lock.ts` (`keepAwake()`: request + re-request on
  `visibilitychange`), the motion permission through the controller when gyro is on, and a
  zero-length vibration only to unlock it is **not** needed (the tap itself is the user
  activation).
- **Touchpad click**: `engine/fingers.ts` gets a `TapClick` helper (tap < 250 ms, new touch within
  300 ms per area); `dom/controller.ts` presses `touchpad` while the double-tapping finger stays on
  that touchpad area.
- **Official skin**: remove `touchpad-click-left`/`-right` (manifest, SVGs, groups), move
  `fullscreen`, `share`, `gyro`, `ps`, `options`, `menu` up 50 units; update
  `packages/skin-format/test/fixtures/ninjoy-reference-boxes.json`, `skins/ninjoy/preview.png` and
  tests that count 28 controls.
- **Rotate notice**: `watchOrientation` gets `setActive(boolean)`; `main.ts` activates it only while
  joined and past the tap screen.
- **Controller list**: new styles for `.nj-lobby` (large cards, depth tokens of the host
  prototype), a `.nj-screen.still` variant without the moving pattern and with a large ninja
  watermark.
- **Vibration**: `createRumble` only calls `vibrate(0)` after it has vibrated.
