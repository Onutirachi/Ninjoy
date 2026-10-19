# Implementation Plan: Controller Page Touch Engine v1

**Branch**: `feat/20261019-151001-controller-touch-engine` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261019-151001-controller-touch-engine/spec.md`

## Summary

Build the controller page as a new framework-free workspace app, `@ninjoy/controller`
(TypeScript + Vite). It renders a resolved skin from `@ninjoy/skin-format`, processes pointer
input with exact SVG hit testing, and produces the DS4 controller state through a small API.
Pure rules (zones, sticks, triggers, finger arbitration, touchpad mapping, layout, motion
frame) live in `engine/` and are unit-tested in Node; everything that needs real SVG geometry
is tested in Chromium through Vitest browser mode, including the official skin, randomized
"no stuck controls" sequences and a throttled performance budget. The prototype in the local
drafts is the behavioral reference.

## Technical Context

**Language/Version**: TypeScript 7, ES modules; Node.js 26 for tooling

**Primary Dependencies**: Runtime — `@ninjoy/skin-format` (workspace). Dev — Vite 8
(MIT), Vitest 5 + `@vitest/browser` + `@vitest/browser-playwright` (MIT), Playwright 1.64
(Apache-2.0). No runtime UI framework. See [research.md](research.md).

**Storage**: `localStorage` (per-device settings, layout edits, control overrides)

**Testing**: Vitest `unit` project (Node) and `browser` project (Chromium headless); seeded
randomized sequences; CDP CPU throttling for the performance budget; CI installs Chromium.

**Target Platform**: Chrome on Android, Safari on iOS/iPadOS (landscape); desktop browsers for
development.

**Project Type**: Web application (single page) inside the npm-workspaces monorepo.

**Performance Goals**: State updated synchronously in the triggering event; < 2 ms per pointer
event on the official skin with ×4 CPU throttling; 60 fps thumb animation.

**Constraints**: No runtime dependencies beyond the workspace package; no `eval` (strict CSP
compatible); all user-facing text in en/pt catalogs; nothing in the skin is modified; no
network use in this feature.

**Scale/Scope**: One page; ~30 controls per skin; up to 10 simultaneous fingers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Real controller fidelity | Pass | Full DS4 state (buttons, sticks, analog triggers, 2-touch touchpad + click, motion). Sending it is the protocol feature. |
| II. Zero-install, LAN-only | Pass | Plain web page; no network in this feature; graceful notices for missing APIs. |
| III. Latency is a requirement | Pass | Budget stated (same-frame state, < 2 ms/event) and measured by a test; cached hit-test matrices; no allocations per event in the hot path beyond the published state object. |
| IV. Declarative, safe skins | Pass | Renders resolved skins only; touch behavior lives in one engine for all skins; the drawing at 100% is the reference; player changes never touch the skin. |
| V. Spec-driven and tested | Pass | Each acceptance scenario maps to a test; browser tests cover SVG geometry; CI runs them. |
| VI. Simplicity | Pass | No UI framework; dev-only tooling justified (browser tests need real geometry). |
| i18n | Pass | en/pt catalogs, auto-detect, English fallback, catalog parity test. |

Post-design re-check: still passing.

## Project Structure

### Documentation (this feature)

```text
specs/20261019-151001-controller-touch-engine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── controller-state.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                     # workspaces: packages/*, controller
.github/workflows/ci.yml         # + npx playwright install --with-deps chromium
controller/
├── package.json                 # @ninjoy/controller
├── index.html
├── vite.config.ts
├── vitest.config.ts             # projects: unit (node), browser (chromium)
├── tsconfig.json
├── src/
│   ├── main.ts                  # bootstraps the bundled official skin, ?dev panel
│   ├── skins.ts                 # import.meta.glob of skins/ninjoy → ResolvedSkin
│   ├── engine/                  # pure, Node-testable
│   │   ├── state.ts             # ControllerState, builder, DS4Button
│   │   ├── zones.ts             # applyZones, triggerForce
│   │   ├── stick.ts             # stickValue (ellipse clamp, zones)
│   │   ├── touchpad.ts          # touchpadPoint, 2-touch selection
│   │   ├── fingers.ts           # ownership, newest/last-entered wins, double-tap
│   │   ├── layout.ts            # groupTransform, autoSize, fit
│   │   ├── settings.ts          # defaults, merge with skin and overrides
│   │   └── motion.ts            # toControllerFrame
│   ├── dom/
│   │   ├── controller.ts        # createController (public API)
│   │   ├── renderer.ts          # root SVG, groups, nested control SVGs, background
│   │   ├── hit-test.ts          # cached matrices, finger circle sampling
│   │   ├── input.ts             # pointer events, release paths
│   │   ├── appearance.ts        # colors, label-on/off, pressed, glow, toggles
│   │   ├── trigger-fill.ts      # masked fill and 100% zone
│   │   └── thumb.ts             # visual smoothing
│   ├── ui/
│   │   ├── menu.ts              # player menu
│   │   ├── edit-mode.ts         # drag/resize groups, per-control overrides
│   │   ├── notices.ts           # unsupported-feature messages
│   │   ├── dev-panel.ts         # live state view (?dev)
│   │   └── styles.css
│   ├── platform/
│   │   ├── motion.ts            # devicemotion, permission
│   │   ├── fullscreen.ts
│   │   ├── vibration.ts
│   │   └── storage.ts           # versioned keys, safe JSON
│   └── i18n/
│       ├── index.ts             # t(), language detection
│       ├── en.json
│       └── pt.json
└── test/
    ├── unit/*.test.ts
    └── browser/*.test.ts
```

**Structure Decision**: The controller is an application, so it lives in `controller/` (as
announced in the skin-format plan), not in `packages/`. If the protocol feature or the Studio
needs the pure engine, `engine/` can later be extracted into a package without changes.

## Complexity Tracking

No constitution violations to justify.
