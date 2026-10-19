# Ninjoy Constitution

Ninjoy is a desktop host (Windows and Linux) that creates virtual game controllers and serves a
browser-based touch controller to phones and tablets on the same local network, so people can
play local multiplayer games with their own devices without installing anything.

## Core Principles

### I. Real Controller Fidelity

- Every connected phone MUST appear to the operating system and to games as a real
  DualShock 4: digital buttons, analog L2/R2, both sticks with L3/R3, PS/Share/Options,
  touchpad (up to 2 touches plus click), gyroscope and accelerometer.
- Feedback from games (rumble, lightbar color) MUST be delivered back to the phone when the
  platform allows it.
- A controller MAY be switched to Xbox 360 mode. The host MUST warn when more than four
  XInput controllers exist, because Windows XInput supports only four.
- Device emulation MUST sit behind a single device-backend interface. Current backends:
  ViGEmBus (Windows) and UHID (Linux). No code outside a backend may depend on a specific
  driver, so DualSense or other drivers can be added without changing the rest of the system.

Rationale: players must be able to use anything a physical DS4 supports, including Steam
Input, without depending on any single, possibly unmaintained, driver.

### II. Zero-Install, LAN-Only

- A player MUST only need a browser: scan a QR code or open `ninjoy.local/<number>` (with
  the host IP as fallback). No app, account, sign-in or internet service is required.
- Ninjoy MUST NOT send data to any server outside the local network.
- The controller MUST work on current Android and iOS browsers. When a platform lacks a
  capability (for example fullscreen or vibration on iOS), the controller MUST degrade
  gracefully and tell the player what is unavailable and why.

Rationale: the core use case is friends on a couch joining in seconds with their own devices.

### III. Latency Is a Requirement

- The input path from touch to virtual device MUST feel instantaneous. Every spec that
  touches the input path MUST state a latency budget and how it is measured.
- Transport MUST use binary WebSocket messages carrying controller state (not event
  streams), so a lost or late message is corrected by the next one.
- Hot paths (touch handling, message encoding/decoding, device report writing) MUST avoid
  per-event allocations and blocking calls.

Rationale: an input delay the player can notice makes the product useless for games.

### IV. Declarative, Safe Skins

- A skin MUST be data only: SVG artwork plus a manifest. Skins MUST NOT contain or load
  executable code. The host MUST sanitize skins on install (remove scripts, event handler
  attributes, foreign objects and external references) and report what was removed.
- All touch behavior MUST live in one shared engine used by every skin. The engine defines:
  the finger as a circle with a configurable size; exact-shape hit areas (an optional
  `hitbox` part replaces the shape); multi-touch and sliding between controls; the last
  finger that entered a trigger or stick wins, falling back to the previous finger; stick
  thumbs clamped to the ellipse inscribed in the hitbox (or base) box; double-tap-and-hold
  for L3/R3 with an optional click lock; trigger dead zone and 100% zone.
- The skin drawing at 100% size is the reference layout. Groups of controls anchor to the
  left, center or right edge when the player shrinks the controller or the screen has a
  different shape. Player customizations (size, height, positions) MUST NOT modify the skin.

Rationale: anyone, including non-programmers, can create and share skins safely, and every
skin behaves the same way.

### V. Spec-Driven and Tested

- Every feature MUST start from a spec under `specs/` with user scenarios and acceptance
  criteria, followed by a plan and tasks, before implementation.
- Behavior validated in prototypes MUST be captured as acceptance criteria and as
  automated tests: unit tests for engine math (hit testing, zones, clamping, layout),
  browser tests (Playwright) for touch behavior, and integration tests for device backends
  where the required driver or kernel support is available.
- A change is not done until its tests pass in CI.

Rationale: touch and input behavior regresses silently; only tests keep it stable.

### VI. Simplicity and Maintainability

- Build the smallest thing that satisfies the spec. The device-backend boundary is the only
  abstraction justified in advance; any other abstraction MUST be justified in the plan.
- Prefer readable code over clever code, and standard platform features over dependencies.
- Every new dependency MUST be justified in the plan (purpose, license compatibility with
  GPL-3.0, maintenance status).

Rationale: this is an open source project that contributors must be able to understand.

## Technology and Product Constraints

- Host: Rust, with Tauri for the desktop interface. Supported platforms: Windows and Linux.
  macOS is out of scope until revisited by an amendment.
- Controller page: TypeScript and Vite. The touch engine core MUST NOT depend on a UI
  framework.
- Network: HTTPS on the LAN with a per-installation self-signed certificate (required for
  motion sensors, fullscreen and wake lock), mDNS name `ninjoy.local` with IP fallback.
- Controllers: numbered slots; a new controller takes the lowest free number; no low cap on
  the number of controllers. A disconnected phone reconnects to its own slot. Opening a slot
  already in use shows a "controller in use" screen; the host can kick a player.
- Internationalization from day one: English and Portuguese, auto-detected from the system
  or browser language with English as fallback, more languages added through locale files.
  No user-facing text may be hard-coded outside locale files.

## Licensing and Distribution

- Source code is licensed under GPL-3.0 with a linking exception for the Steamworks SDK.
- The Ninjoy name, logo and official skins are not covered by the GPL and are distributed
  under their own license.
- Anyone may build Ninjoy from source for free. A paid convenience build is distributed on
  Steam (installer, drivers, updates, Workshop skins); it MUST NOT lock core functionality
  that the source build lacks.

## Development Workflow

- All code, specs, commits, documentation and code comments are written in English.
- Every commit MUST follow Conventional Commits. Commits MUST NOT include `Co-Authored-By`
  or any AI attribution trailer.
- Branch names use conventional prefixes: `feat/<timestamp>-<slug>` for spec features
  (timestamp numbering avoids collisions between contributors), and `fix/`, `docs/`,
  `chore/`, `refactor/`, `test/` for other work.
- All changes land on `main` through pull requests reviewed by the maintainer.

## Governance

- This constitution supersedes any other practice or guideline in the project.
- Amendments are made by pull request that states the rationale and bumps the version:
  MAJOR for removing or redefining a principle, MINOR for adding a principle or materially
  expanding guidance, PATCH for clarifications and wording.
- Every plan MUST include a constitution check, and every pull request review MUST verify
  compliance. Deviations MUST be documented in the plan with justification.

**Version**: 1.0.0 | **Ratified**: 2026-10-19 | **Last Amended**: 2026-10-19
