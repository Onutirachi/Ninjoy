# Research: Controller Page Touch Engine v1

Decisions for the open points of [plan.md](plan.md). Versions checked on 2026-10-19.

## R1. Separation of pure logic and DOM

- **Decision**: Three layers inside `controller/src/`:
  - `engine/` — pure TypeScript, no DOM: zones, stick math, trigger force, finger arbitration
    (which finger owns which stick/trigger, last-finger-wins, double-tap timing), touchpad
    mapping, layout transforms, settings resolution, controller state building, motion frame
    conversion.
  - `dom/` — rendering the skin, hit testing, pointer events, appearance (colors, icons, glow,
    trigger fill, thumb animation).
  - `ui/` + `platform/` — player menu, edit mode, notices, development panel; motion,
    fullscreen, vibration and storage adapters.
- **Rationale**: The rules validated in the prototype are mostly arithmetic and state
  machines; isolating them makes them unit-testable in Node in milliseconds, and keeps the DOM
  layer thin. The prototype mixed everything in one file, which is how the "toggle flips" bug
  slipped in.
- **Alternatives considered**: A UI framework (Lit, Solid, React) — rejected by the
  constitution (framework-free engine) and unnecessary for a single screen; one module per
  control type mixing DOM and math — harder to test.

## R2. Hit testing

- **Decision**: Use the browser's SVG geometry: for each candidate shape, map the finger
  points into the shape's coordinates with the inverse of its screen matrix and test
  `isPointInFill` (and `isPointInStroke` only for shapes with a visible stroke). The finger is
  the center plus 8 points on its radius (validated in the prototype). Cache each shape's
  inverse matrix and screen bounding box per layout revision, and skip shapes whose box
  (grown by the radius) does not contain the touch.
- **Rationale**: Exact for any artwork (curves, holes, groups) with no geometry code of our
  own. Caching removes the per-event matrix work that dominates cost.
- **Alternatives considered**: Rasterized hit maps (offscreen canvas per control) — resolution
  errors at edges and memory per size change; converting paths to polygons in JS — large,
  error-prone code; `elementFromPoint` — only one element per point, ignores finger size.

## R3. Rendering

- **Decision**: One root `<svg>` whose `viewBox` is recomputed for the screen (height 720 units,
  width = 720 × aspect ratio). Each group is a `<g>` with a transform (anchor + size + height +
  player edits); each control is a nested `<svg>` placed at its `box` with its own `viewBox`
  (fit preserving aspect ratio, centered). The background is a CSS layer behind the root SVG
  (color, `background-image` with cover/contain/center/repeat, opacity). Thumb elements get a
  translate transform prepended. Colors are applied by setting `fill` on the affected shapes
  only when a control changes state.
- **Rationale**: Native SVG scaling keeps artwork crisp; nested SVGs give each control the
  "fit into box" behavior for free; CSS backgrounds give the four placements without
  distortion.
- **Alternatives considered**: Canvas rendering — loses vector hit testing and requires
  redrawing every frame; one `<img>` per control — cannot recolor elements.

## R4. Trigger fill

- **Decision**: As in the prototype: a mask built from clones of the trigger's base shapes
  (white silhouette), containing two rectangles (fill and 100% zone) sized along the
  direction; opacities `0.3 + 0.7·force` (fill) and `0.12 + 0.88·force³` (zone), zero when
  untouched. A custom `level` element is revealed with a growing rectangle mask instead.
- **Rationale**: Exact clipping to any shape and to the union of several base shapes,
  validated by the maintainer.

## R5. Pointer input

- **Decision**: Pointer Events on the stage with `touch-action: none` and pointer capture;
  every `pointerdown`/`pointermove` updates the finger and recomputes the state synchronously;
  `pointerup`, `pointercancel`, `lostpointercapture`, window `blur` and `visibilitychange`
  (hidden) release fingers. Mouse input behaves as one finger (development).
- **Rationale**: One API for touch, pen and mouse; synchronous processing meets "same frame".

## R6. Tests

- **Decision**: Vitest 5 with two projects: `unit` (Node) for `engine/`, and `browser`
  (Vitest browser mode, provider `@vitest/browser-playwright`, Chromium headless) for `dom/`,
  `ui/` and end-to-end behavior on the official skin with synthetic PointerEvents. Randomized
  touch sequences use a seeded PRNG (inline mulberry32) so failures are reproducible. CI
  installs Chromium with `npx playwright install --with-deps chromium`.
- **Rationale**: Hit testing needs real SVG geometry (only a browser has it); Vitest browser
  mode reuses the same runner and assertions as the Node tests. All MIT / Apache-2.0.
- **Alternatives considered**: jsdom/happy-dom — no SVG geometry (`isPointInFill` missing);
  separate Playwright test runner — a second framework for the same purpose.

## R7. Performance measurement

- **Decision**: A browser test dispatches 1,000 pointer moves over the official skin and
  measures the average handler time, with Chromium CPU throttling ×4 (via CDP
  `Emulation.setCPUThrottlingRate`) as the mid-range-phone proxy; budget < 2 ms per event.
- **Rationale**: Gives a repeatable number in CI for SC-002.

## R8. Motion

- **Decision**: `devicemotion` events: `rotationRate` (°/s; beta = x, gamma = y, alpha = z) and
  `accelerationIncludingGravity` (m/s²). Rotate the x/y components by the screen orientation
  angle (`screen.orientation.angle`, fallback `window.orientation`) into a controller frame
  (x right, y up, z toward the player). Unit conversion to DS4 values belongs to the host.
  iOS: call `DeviceMotionEvent.requestPermission()` from the gyro tap. Motion requires a
  secure context (HTTPS), which the host provides; in development on a PC there is no sensor
  and gyro reports zeros.
- **Rationale**: Standard API on Android and iOS; orientation correction makes "tilt right"
  mean the same in both landscape directions.

## R9. Fullscreen and vibration

- **Decision**: `Element.requestFullscreen()` when available; otherwise (iPhone) a notice
  explaining "Share → Add to Home Screen". `navigator.vibrate(12)` when available.
- **Rationale**: Validated in the prototype; iPhone Safari has neither API.

## R10. Settings storage

- **Decision**: `localStorage` with versioned keys — `ninjoy.v1.settings`,
  `ninjoy.v1.layout.<skin>`, `ninjoy.v1.overrides.<skin>` where `<skin>` is the skin's name and
  version — wrapped in try/catch; unreadable or missing data falls back to defaults.
- **Rationale**: Per-device persistence with no server; versioned keys let future changes
  ignore old data safely.

## R11. Internationalization

- **Decision**: JSON catalogs `controller/src/i18n/en.json` and `pt.json` and a small `t(key,
  params)` helper; language from the setting, else `navigator.languages` (first starting with
  `pt` → pt), else English. A test enforces that both catalogs have the same keys.
- **Rationale**: Two languages and a few dozen strings do not justify a library.

## R12. Bundling the official skin and development mode

- **Decision**: Vite `import.meta.glob` (eager, raw) over `skins/ninjoy/` builds the package
  in memory and loads it with `@ninjoy/skin-format`. The URL parameter `?dev` shows the live
  controller state panel.
- **Rationale**: No host yet; the protocol feature will replace the bundled skin with skins
  served by the host.
