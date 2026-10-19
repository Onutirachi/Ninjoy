---

description: "Task list for the controller touch engine v1"
---

# Tasks: Controller Page Touch Engine v1

**Input**: Design documents from `specs/20261019-151001-controller-touch-engine/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/controller-state.md](contracts/controller-state.md),
[quickstart.md](quickstart.md)

**Tests**: Required by the constitution (Principle V). Tests are written before the code they
cover. `unit` = Vitest in Node (`controller/test/unit/`); `browser` = Vitest browser mode in
Chromium (`controller/test/browser/`).

**Reference behavior**: the maintainer-validated prototype in
`drafts/skin-system/tools/preview-template.html` (local, not in the repository).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: User story from spec.md (US1–US7)

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add `controller` to the root `package.json` workspaces (`["packages/*", "controller"]`)
- [X] T002 Create `controller/package.json` as `@ninjoy/controller` (private, ESM; scripts `dev` = `vite`, `build` = `vite build`, `test` = `vitest run`, `typecheck` = `tsc --noEmit`; dependency `@ninjoy/skin-format` `*`; dev dependencies `vite@^8`, `vitest@^5`, `@vitest/browser@^5`, `@vitest/browser-playwright@^5`, `playwright@^1.64`, `typescript@^7`), `controller/tsconfig.json` (extends base, `lib` DOM + ES2023, `allowImportingTsExtensions`), and `controller/index.html` (root element, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, landscape-friendly)
- [X] T003 [P] `controller/vite.config.ts` (server `host: true` so phones on the LAN can open it; `fs.allow` includes the repository root for `skins/`)
- [X] T004 [P] `controller/vitest.config.ts` with two projects: `unit` (environment node, `test/unit/**`) and `browser` (`browser.enabled`, provider `playwright()` from `@vitest/browser-playwright`, instance `chromium`, headless, `test/browser/**`)
- [X] T005 [P] Update `.github/workflows/ci.yml`: after `npm ci`, run `npx playwright install --with-deps chromium`
- [X] T006 Run `npm install` and `npx playwright install chromium`; commit `package-lock.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: State model, settings, storage, i18n, bundled skin, renderer, hit testing, input
loop and the `createController` API that every story extends.

### Tests

- [X] T007 [P] Unit test `controller/test/unit/state.test.ts`: an empty state has no buttons, zero sticks/triggers, no touches; `seq` increments on every publish; the builder OR-s buttons and max-es trigger forces; digital `l2`/`r2` set while force > 0
- [X] T008 [P] Unit test `controller/test/unit/settings.test.ts`: defaults (`size auto`, `height 0`, `finger 14`, zones from skin or built-in `0.10 / 0.05 / 0 / 0.25`, `gyro true`, `language auto`); ranges clamp (size 0.4–1, finger 0–40, stick dead 0–0.40, stick max 0–0.30, trigger min 0–0.50, trigger max 0–0.50); player values override skin defaults
- [X] T009 [P] Unit test `controller/test/unit/storage.test.ts`: versioned keys `ninjoy.v1.settings`, `ninjoy.v1.layout.<skin>`, `ninjoy.v1.overrides.<skin>` (skin key = name + version); unreadable JSON or a throwing storage falls back to defaults
- [X] T010 [P] Unit test `controller/test/unit/i18n.test.ts`: `en.json` and `pt.json` have the same keys; `navigator.languages` `["pt-BR"]` → pt, `["de"]` → en; explicit setting wins; `{param}` interpolation
- [X] T011 [P] Browser test `controller/test/browser/render.test.ts`: the bundled official skin renders 28 control SVGs and the background layer; each control's on-screen box matches its canvas box at 100% on a 1600 × 720 root (SC-004 basis)

### Implementation

- [X] T012 [P] `controller/src/engine/state.ts`: `DS4Button`, `ControllerState` exactly as in `contracts/controller-state.md`, and a `StateBuilder` (reset, press, stick, trigger force, touches, motion, gyro, publish → frozen object with incremented `seq` and `time`)
- [X] T013 [P] `controller/src/engine/settings.ts`: `PlayerSettings`, defaults, clamping, merge order (player → skin tuning → built-in) per data-model.md
- [X] T014 [P] `controller/src/platform/storage.ts`: safe JSON get/set over an injectable `Storage` with the versioned keys
- [X] T015 [P] `controller/src/i18n/index.ts`, `controller/src/i18n/en.json`, `controller/src/i18n/pt.json`: `t(key, params)`, detection from setting → `navigator.languages` → English
- [X] T016 `controller/src/skins.ts`: `import.meta.glob` (eager, raw) of `skins/ninjoy/skin.json` and `skins/ninjoy/controls/*.svg` → `filesFromMap` → `loadSkin` → `ResolvedSkin` (throw with the formatted report if it fails)
- [X] T017 `controller/src/dom/renderer.ts`: root `<svg>` with `viewBox` = `0 0 (720 × aspect) 720`; one `<g>` per resolved group; each control a nested `<svg>` at its box with the control SVG's own `viewBox` and contents (ids kept, prefixed per control to stay unique); background CSS layer (color, image placement cover/contain/center/tile, opacity); a `relayout()` hook that only re-applies group transforms
- [X] T018 `controller/src/dom/hit-test.ts`: touch-area shapes per control (hitbox shape, else every shape inside base elements, else the whole control); stroke counted only when computed stroke is visible and width > 0; per layout revision cache each shape's inverse screen matrix and screen box; `hits(control, x, y, radius)` tests the center plus 8 points on the radius with `isPointInFill`/`isPointInStroke`
- [X] T019 `controller/src/dom/input.ts`: pointer events on the stage (`touch-action: none`, capture with try/catch), fingers map, and the release paths of FR-017 (`pointerup`, `pointercancel`, `lostpointercapture`, window `blur`, `visibilitychange` hidden, explicit `releaseAll`)
- [X] T020 `controller/src/dom/controller.ts`: `createController(options)` wiring renderer, hit test, input and the state builder; `subscribe`, `settings`, `updateSettings`, `releaseAll`, `relayout` (also on resize/orientation change), `dispose`; recompute and publish synchronously on every input event
- [X] T021 [P] `controller/src/ui/dev-panel.ts` and `controller/src/main.ts`: bootstrap the bundled skin full-screen; with `?dev` show a live panel (pressed buttons, stick dots, trigger bars, touchpad dots, gyro/motion)

**Checkpoint**: the official skin renders; `npm test` passes; `npm run dev` shows the skin.

---

## Phase 3: User Story 1 - Press buttons like a real controller (Priority: P1) 🎯 MVP

**Independent Test**: In development mode, press, slide and release on buttons and watch the
state.

- [X] T022 [P] [US1] Browser test `controller/test/browser/buttons.test.ts`: all US1 acceptance scenarios — press/release ✕; slide ✕ → ○ (release then press as the finger circle leaves/reaches); finger circle over △ and ○ presses both; finger size 0 and a point 1 px outside the drawn edge does not press; two fingers on one button (released only when both lift); a finger landing on empty space and sliding onto a button presses it
- [X] T023 [P] [US1] Browser test `controller/test/browser/no-stuck.test.ts`: 200 seeded random sequences (1–5 fingers, down/move/up/cancel, moves across the whole screen, random `blur`/`visibilitychange`) on the official skin always end with an empty state (SC-003); the seed is printed on failure
- [X] T024 [US1] Button handling in `controller/src/dom/controller.ts`: per finger, the set of touched controls; a button is pressed while any finger touches it; its bindings are added to the state (`touchpad-left`/`touchpad-right` handled in US4)

**Checkpoint**: MVP — buttons work exactly like the prototype.

---

## Phase 4: User Story 2 - Use analog sticks (Priority: P1)

**Independent Test**: Drag on a stick, read values and thumb position; double-tap and hold.

- [ ] T025 [P] [US2] Unit test `controller/test/unit/stick.test.ts`: `stickValue` — offset/travel per axis, unit-ellipse clamp, radial dead zone 10% → 0, 100% zone 5% → magnitude 1 beyond 95%, rectangular box gives independent axes; `applyZones` boundaries
- [ ] T026 [P] [US2] Unit test `controller/test/unit/fingers.test.ts`: a stick takes a finger on first touch and keeps it outside; newest finger wins and the previous takes over; a finger already owned by a stick is not taken by another stick; double-tap: tap < 250 ms then a touch within 300 ms sets click; a 300 ms tap or a 400 ms gap does not
- [ ] T027 [P] [US2] Browser test `controller/test/browser/sticks.test.ts`: US2 scenarios on the official skin and on an off-center/rectangular-hitbox test skin — value follows and saturates outside; same finger presses a button it passes; thumb rests where drawn, follows the finger's center within the ellipse minus thumb size, returns to rest; visual smoothing does not delay the value; double-tap-and-hold holds L3 while the stick moves; `click: none` disables it
- [ ] T028 [P] [US2] `controller/src/engine/zones.ts` (`applyZones`) and `controller/src/engine/stick.ts` (`stickValue`)
- [ ] T029 [P] [US2] `controller/src/engine/fingers.ts`: stick ownership, newest-wins, double-tap timing (250 ms tap, 300 ms window), trigger last-entered ordering (used in US3) and touchpad recency (used in US4)
- [ ] T030 [US2] `controller/src/dom/thumb.ts`: thumb and thumb-label elements translated together; rest offset kept as a ratio of the touch-area box; exponential smoothing 25 ms following / 45 ms returning in `requestAnimationFrame`, animation only while moving
- [ ] T031 [US2] Stick handling in `controller/src/dom/controller.ts`: touch-area box and thumb ratio measured per layout, stick values and click binding into the state, thumb target updates

---

## Phase 5: User Story 3 - Use analog triggers (Priority: P1)

**Independent Test**: Touch a trigger at several heights, read the force, watch the fill.

- [ ] T032 [P] [US3] Unit test `controller/test/unit/trigger.test.ts`: `triggerForce(r, z, m) = m + (1 − m) × min(1, r / (1 − z))`; 40% with z 0.25 → 0.533; 80% → 1; bottom with m 0.10 → 0.10; no touch → 0
- [ ] T033 [P] [US3] Browser test `controller/test/browser/triggers.test.ts`: US3 scenarios — force by position for each direction (up/down/left/right test skin), last finger entered decides then the previous; no fill visible when untouched; fill clipped to the union of base shapes (two-base test skin); fill opacity `0.3 + 0.7·force`, zone opacity `0.12 + 0.88·force³`, both 0 when untouched; skin `showFill: false` → no fill and active appearance
- [ ] T034 [P] [US3] `triggerForce` in `controller/src/engine/zones.ts`
- [ ] T035 [US3] `controller/src/dom/trigger-fill.ts`: mask from clones of all base shapes, fill and 100%-zone rectangles inserted after the last base element, custom `level` revealed by a growing mask, opacities from research R4
- [ ] T036 [US3] Trigger handling in `controller/src/dom/controller.ts`: raw position along the direction within the touch-area box, last-entered finger, force into the state (max over controls with the same trigger)

---

## Phase 6: User Story 4 - Touchpad, system controls and motion (Priority: P2)

**Independent Test**: Touch the halves and click buttons, tap system controls, simulate motion.

- [ ] T037 [P] [US4] Unit test `controller/test/unit/touchpad.test.ts`: `touchpadPoint` for full/left/right areas; selection of the 2 most recent touches
- [ ] T038 [P] [US4] Unit test `controller/test/unit/motion.test.ts`: `toControllerFrame` for orientation angles 0, 90, −90/270, 180 (x/y rotated, z unchanged); gyro off → null motion
- [ ] T039 [P] [US4] Browser test `controller/test/browser/system.test.ts`: US4 scenarios — half centers map to (0.25, 0.5) / (0.75, 0.5); only 2 most recent of 3 touches; touchpad-left click button presses `touchpad` and adds a left-half touch only when no finger is on the touchpad; menu opens only on release; fullscreen toggles through a stubbed platform and shows the home-screen notice when unsupported; gyro toggle on release updates `gyro`; motion events (stubbed) appear in the state only while gyro is on; permission denied keeps gyro off with a notice
- [ ] T040 [P] [US4] `controller/src/engine/touchpad.ts` and `controller/src/engine/motion.ts`
- [ ] T041 [P] [US4] `controller/src/platform/motion.ts` (devicemotion listener, iOS `requestPermission` from a user gesture, orientation angle), `controller/src/platform/fullscreen.ts`, `controller/src/platform/vibration.ts` — all injectable for tests
- [ ] T042 [US4] Touchpad and system handling in `controller/src/dom/controller.ts`: touchpad touches and click buttons; system actions on release (menu → open menu, fullscreen, gyro); motion into the state while gyro is on
- [ ] T043 [P] [US4] `controller/src/ui/notices.ts`: one-time, translated notices (no fullscreen → "Share → Add to Home Screen", no vibration, motion permission denied, no motion sensor)

---

## Phase 7: User Story 5 - Fit any screen and hand (Priority: P2)

**Independent Test**: Render at 20:9, 16:9, 4:3; change size/height; edit and reload.

- [X] T044 [P] [US5] (done in Phase 2: the renderer needs it) Unit test `controller/test/unit/layout.test.ts`: `groupTransform` per data-model.md formula — identity at 100% on 20:9; anchors at wider aspect; fit-width on 4:3; size shrinks towards the anchor bottom; lift = height × free space; player offsets scale with size; player scale around the group center; `autoSize(430) = 1`, `autoSize(770) ≈ 0.56`, `autoSize(2000) = 0.4`
- [ ] T045 [P] [US5] Browser test `controller/test/browser/layout.test.ts`: US5 scenarios on the official skin at 1600×720 (every control within 1 px, SC-004), 16:9 (left/right groups at their edges), 4:3 (fits width); SC-005 check (lower outer corner of each side group within 15% of the screen width from its edge at automatic size on 1024×768); edit-mode drag + resize, size change keeps relative positions, reload keeps edits, reset restores
- [X] T046 [P] [US5] (done in Phase 2: the renderer needs it) `controller/src/engine/layout.ts`: `groupTransform`, `autoSize`, fit factor
- [ ] T047 [US5] Apply layout in `controller/src/dom/renderer.ts` (group transforms on relayout, size/height from settings) and invalidate hit-test caches
- [ ] T048 [US5] `controller/src/ui/edit-mode.ts`: select a group (or ungrouped control) under the finger, drag (delta converted to canvas units at the current scale), resize 50–200% around its center, persist per skin, reset; inputs are not sent to the state while editing

---

## Phase 8: User Story 6 - Player menu and personal settings (Priority: P2)

**Independent Test**: Change each setting, observe it, reload.

- [ ] T049 [P] [US6] Browser test `controller/test/browser/menu.test.ts`: US6 scenarios — finger size applies immediately to hit testing; zone changes apply to inheriting sticks/triggers; per-trigger override in edit mode starts from menu values and changes only that trigger; language auto (pt-BR → Portuguese, de → English) and manual choice; every setting persists across a reload; opening the menu releases all controls; the skin data is unchanged
- [ ] T050 [US6] `controller/src/ui/menu.ts` and `controller/src/ui/styles.css`: menu with size (auto + slider), height, finger size, stick dead/100% zones, trigger min force/100% zone, gyro, fullscreen, edit layout, reset layout, language; every text from the catalogs; opening calls `releaseAll`
- [ ] T051 [US6] Per-control overrides in `controller/src/ui/edit-mode.ts` and `controller/src/engine/settings.ts`: "inherit from menu" per trigger/stick, initialized from menu values, persisted per skin, used by stick/trigger handling

---

## Phase 9: User Story 7 - Clear visual feedback (Priority: P2)

**Independent Test**: Press controls of the official skin and compare with the declared looks.

- [ ] T052 [P] [US7] Browser test `controller/test/browser/appearance.test.ts`: US7 scenarios — every element shows its resolved active color while active and its inactive color (or the SVG's own) otherwise, all at once; stick base and thumb change while the stick is used; label-on/label-off swap and single-icon behavior; glow present in the glow color or the active base color, absent when disabled; gyro looks active while on unless `toggleActive` is false; vibration stub called once per activation
- [ ] T053 [US7] `controller/src/dom/appearance.ts`: apply resolved colors per element (descendants of colored groups included), label-on/off visibility, pressed elements, glow (concentrated drop shadows), toggle active look, trigger glow when the fill is shown; changes only on state transitions
- [ ] T054 [US7] Vibration on activation in `controller/src/dom/controller.ts` through `controller/src/platform/vibration.ts` (12 ms, only for touch input)

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T055 [P] Performance test `controller/test/browser/performance.test.ts`: CPU throttling ×4 via the browser CDP session; 1,000 pointer moves over the official skin average < 2 ms per event; state published within the event handler (SC-002)
- [ ] T056 [P] Update `README.md` (repository layout: `controller/`; `npm run dev --workspace @ninjoy/controller`)
- [ ] T057 Run every scenario in `specs/20261019-151001-controller-touch-engine/quickstart.md` (including a manual check on a phone with `?dev`) and fix gaps
- [ ] T058 Mark completed tasks in `specs/20261019-151001-controller-touch-engine/tasks.md` and set **Status** to "Implemented" in `specs/20261019-151001-controller-touch-engine/spec.md`

---

## Dependencies & Execution Order

- **Setup → Foundational → stories.**
- **US1** needs only the foundation. **US2** and **US3** build on US1's per-finger touched set.
- **US4** needs US1 (click buttons) and the finger recency from T029.
- **US5** needs the renderer (T017); **US6** needs US5's edit mode (T048) for overrides.
- **US7** needs US1–US4 (all control types active).
- **Polish** after all stories.

Recommended order: T001–T021 → US1 → US2 → US3 → US4 → US5 → US6 → US7 → Polish.

### Parallel opportunities

- Setup: T003, T004, T005 together.
- Foundation: tests T007–T011 together; T012–T015 together.
- Within each story, the [P] tests and the [P] pure-engine files can be written together.

## Implementation Strategy

1. Phases 1–2, then US1 (MVP: buttons exactly like the prototype). **Stop and validate.**
2. Sticks and triggers (US2, US3) complete the core controller.
3. Touchpad/system/motion, screens, menu and appearance (US4–US7).
4. Commit after each task or logical group with Conventional Commits
   (`feat(controller): …`, `test(controller): …`, `chore: …`, `docs: …`).
