---

description: "Task list for the skin package format v1"
---

# Tasks: Skin Package Format v1

**Input**: Design documents from `specs/20261019-122142-skin-package-format/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required by the constitution (Principle V). Test tasks come before the
implementation they cover; write them first and see them fail.

**Organization**: Tasks are grouped by user story so each story is an independently testable
increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: User story from spec.md (US1–US6)
- Paths are relative to the repository root; the package lives in `packages/skin-format/`
  (abbreviated `pkg/` below only in prose, never in task paths)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo, package skeleton, CI.

- [X] T001 Create the npm-workspaces root `package.json` (private, `"type": "module"`, `"workspaces": ["packages/*"]`, scripts `test`, `typecheck` delegating to workspaces) and `tsconfig.base.json` (strict, ES2023, `module`/`moduleResolution` `NodeNext`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- [X] T002 Create `packages/skin-format/package.json` as `@ninjoy/skin-format` (ESM, `exports` for `./` and `./schema`, scripts `test` = `vitest run`, `typecheck` = `tsc --noEmit`, `validate` = run `src/cli.ts`), with dependencies `@cfworker/json-schema@^4`, `saxes@^6`, `fflate@^0.8` and dev dependencies `typescript@^7`, `vitest@^5`, `@types/node`; plus `packages/skin-format/tsconfig.json` extending the base config
- [X] T003 [P] Add `packages/skin-format/vitest.config.ts` (Node environment, `test/**/*.test.ts`)
- [X] T004 [P] Add `.github/workflows/ci.yml`: on pull requests and pushes to `main`, Node 26, `npm ci`, `npm run typecheck`, `npm test`
- [X] T005 [P] Copy `specs/20261019-122142-skin-package-format/contracts/skin-manifest.v1.schema.json` to `packages/skin-format/schema/skin-manifest.v1.schema.json`
- [X] T006 Run `npm install` at the root and commit the generated `package-lock.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, file access, report/messages, schema step, SVG scanner and the loader
skeleton that every story extends.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation

- [X] T007 [P] Schema parity test in `packages/skin-format/test/schema-parity.test.ts`: the package schema file is byte-identical to `specs/20261019-122142-skin-package-format/contracts/skin-manifest.v1.schema.json`
- [X] T008 [P] Messages completeness test in `packages/skin-format/test/messages.test.ts`: every `ReportCode` has a non-empty message in `messages/en.json` and `messages/pt.json`, and every `{param}` used in a message exists in that code's params
- [X] T009 [P] Files test in `packages/skin-format/test/files.test.ts`: `filesFromMap` lists and reads string and `Uint8Array` entries; reading a missing path rejects

### Implementation

- [X] T010 [P] Constants in `packages/skin-format/src/constants.ts`: `CANVAS = { width: 1600, height: 720 }`, `MAX_PACKAGE_BYTES = 20 * 1024 * 1024`, `BUILTIN` exactly as in `contracts/loader-api.md` (trigger `maxZone 0.25`, `minForce 0`, `fill "#3099E8"`, `showFill true`; stick `deadZone 0.1`, `maxZone 0.05`; glow `{ enabled: true, color: "active" }`; `toggleActive true`)
- [X] T011 [P] Public types in `packages/skin-format/src/types.ts`: `SkinFiles`, `LoadResult`, `ReportEntry`, `ResolvedSkin`, `ResolvedControl`, `ResolvedElement`, `Anchor`, `Binding`, `Role` exactly as in `contracts/loader-api.md`; `Role` = `base | label | label-on | label-off | thumb | thumb-label | hitbox | pressed | level`
- [X] T012 [P] `filesFromMap` in `packages/skin-format/src/files.ts` (UTF-8 encode strings, normalize paths to `/`)
- [X] T013 [P] Report infrastructure in `packages/skin-format/src/report.ts`: `ReportCode` union, `ReportCollector` (`error`/`warning`/`info` with params), `formatReportEntry(entry, locale)` with `{param}` interpolation and English fallback; catalogs `packages/skin-format/messages/en.json` and `packages/skin-format/messages/pt.json` with the codes used by the foundation (`missing-manifest`, `invalid-json`, `schema-invalid-value`, `schema-missing-field`, `schema-unexpected-field`, `invalid-svg`, `missing-file`, `package-too-large`)
- [X] T014 Schema step in `packages/skin-format/src/validate/schema.ts`: validate with `@cfworker/json-schema` (draft `2020-12`, `shortCircuit: false`); report one `schema-invalid-value` / `schema-missing-field` / `schema-unexpected-field` error per offending field with `field` (JSON pointer) and `value`, keeping only the most specific errors (`enum`, `const`, `pattern`, `required`, `type`, `minimum`/`maximum`, `minItems`, `uniqueItems`, `exclusiveMinimum`) and dropping cascade errors (`$ref`, `allOf`, `anyOf`, `if`, `properties`, `items`, and `unevaluatedProperties` when a more specific error exists for the same control)
- [X] T015 SVG scanner in `packages/skin-format/src/validate/svg.ts` using `saxes`: returns `{ ids: Map<id, { tag, insideGroupIds: string[], isShape, isGroup }>, references: string[] }`; shapes are `path`, `circle`, `ellipse`, `rect`, `polygon`, `polyline`, `line`, `text`; groups are `g`; parse errors → `invalid-svg` with `file`
- [X] T016 Loader skeleton in `packages/skin-format/src/load.ts` and `packages/skin-format/src/index.ts`: size check (> `MAX_PACKAGE_BYTES` → `package-too-large`), read `skin.json` (missing → `missing-manifest`; bad JSON → `invalid-json`), schema step, read every control SVG (missing → `missing-file`), scan it, return `{ ok: false, report }` when any error exists, otherwise a `ResolvedSkin` with meta, controls (id, type, `svg { path, text }`, box, type-specific fields with defaults: trigger `direction "up"`, stick `click` `l3` for left / `r3` for right) — anchors, colors, glow, tuning resolved by later stories; export `skinManifestSchema`

**Checkpoint**: `npm test` passes; a minimal manifest loads.

---

## Phase 3: User Story 1 - Play with the official Ninjoy skin (Priority: P1) 🎯 MVP

**Goal**: The official skin exists in the new format and loads cleanly.

**Independent Test**: `loadSkin` on `skins/ninjoy` returns `ok: true`, zero errors and zero
warnings, with every control of the original drawing at its drawn box and binding.

### Tests for User Story 1

- [X] T017 [US1] Official skin test in `packages/skin-format/test/official-skin.test.ts`: loads `skins/ninjoy` from disk; asserts zero errors and zero warnings; asserts the set of bindings/types covers cross, circle, square, triangle, up, down, left, right, l1, r1 (on both sides), analog l2 and r2 triggers (both sides), stick-left and stick-right, share, options, ps, touchpad-left and touchpad-right areas, touchpad-left and touchpad-right click buttons, and system menu, fullscreen, gyro; asserts each control box matches `packages/skin-format/test/fixtures/ninjoy-reference-boxes.json` within 1 canvas unit (SC-001)

### Implementation for User Story 1

- [X] T018 [US1] Convert the local draft `drafts/skin-system/ninjoy/skin.svg` into `skins/ninjoy/`: one SVG per control in `skins/ninjoy/controls/<id>.svg` (artwork translated so each control's own viewBox is its bounding box), `skins/ninjoy/skin.json` with boxes scaled from the draft viewBox `176.11 × 79.25` to the 1600 × 720 canvas, element roles (base, label, label-on/label-off for fullscreen, thumb + thumb-label for sticks, hitbox circles for sticks), the 10 groups and anchors of the draft (`lshoulders`/`dpad`/`lstick`/`ltouchpad`/`lcenter` left; `rtouchpad`/`rcenter`/`rstick`/`actions`/`rshoulders` right), defaults (colors base `#1F4A6B`/`#227DC3`, label active `#FFFFFF`, thumb `#266697`/`#3099E8`, trigger fill `#3099E8`, glow color `active`, tuning trigger `maxZone 0.25`, `minForce 0`, stick `deadZone 0.1`, `maxZone 0.05`), and `packages/skin-format/test/fixtures/ninjoy-reference-boxes.json` with the boxes measured from the draft (conversion done once with a browser script; the script is not committed)
- [X] T019 [P] [US1] Render `skins/ninjoy/preview.png` (1600 × 720) from the draft
- [X] T020 [P] [US1] Add `skins/ninjoy/LICENSE.md` stating the official skin is not covered by the GPL (all rights reserved, see `TRADEMARKS.md`)

**Checkpoint**: MVP — the official skin is a valid package.

---

## Phase 4: User Story 2 - Artist creates a skin by hand (Priority: P1)

**Goal**: A hand-written package with buttons, sticks and triggers loads with the right roles
and type-specific settings; archives work.

**Independent Test**: The `minimal` fixture (one multi-binding button, one stick, one right-
direction trigger) loads and resolves bindings, thumb roles and trigger direction.

### Tests for User Story 2

- [X] T021 [P] [US2] Fixture `packages/skin-format/test/fixtures/minimal/` (skin.json + 3 SVGs + menu) and test `packages/skin-format/test/minimal.test.ts`: button with bindings `["up","left"]` resolves both; stick resolves `side`, default `click` (`l3`) and elements with roles `base`/`thumb`/`thumb-label`/`hitbox`; trigger with `direction: "right"` resolves it; an SVG group id with role `label` counts as one element
- [X] T022 [P] [US2] Role rule tests in `packages/skin-format/test/roles.test.ts` with inline packages: stick without thumb → error `missing-thumb`; two hitboxes → `too-many-hitboxes`; hitbox that is a `g` → `hitbox-not-single-shape`; no hitbox and no base → `missing-touch-area`; several base elements without hitbox → valid; `thumb` on a button → `role-not-allowed`; `level` on a button → warning `role-ignored`; element id not in the SVG → `unknown-element`; a group and a descendant listed with different roles → `conflicting-roles`
- [X] T023 [P] [US2] Archive test in `packages/skin-format/test/zip.test.ts`: zipping the `minimal` fixture and loading through `filesFromZip` gives the same result as the folder; an archive whose declared uncompressed size exceeds 20 MB is rejected with `package-too-large` before inflating

### Implementation for User Story 2

- [X] T024 [US2] Element role semantics in `packages/skin-format/src/validate/semantics.ts`: implement every rule of the role table in `data-model.md` (hitbox "0 or 1, single shape"; base "≥ 1 without hitbox"; thumb "≥ 1 for sticks"; thumb/thumb-label only on sticks; level only on triggers; label-on/label-off allowed on all), `unknown-element`, `conflicting-roles`; add the codes to `messages/en.json` and `messages/pt.json`
- [X] T025 [US2] Resolve element lists in `packages/skin-format/src/resolve.ts` (`ResolvedElement { id, role, colors }`, colors left `null` until US6) and wire it into `load.ts`
- [X] T026 [P] [US2] `filesFromZip` in `packages/skin-format/src/files.ts` with `fflate` (`.ninjoyskin`; check the sum of uncompressed sizes against `MAX_PACKAGE_BYTES` before inflating)
- [X] T027 [US2] Author documentation `docs/skins/format.md` (English): package layout, canvas, every manifest field with types and defaults, control types and bindings, element roles and the single-shape touch-area rule, groups/anchors, colors, tuning, a complete two-control example, and how to validate with the CLI

**Checkpoint**: Hand-written skins load; docs allow writing one (SC-002).

---

## Phase 5: User Story 4 - Skins cannot harm players (Priority: P1)

**Goal**: Any unsafe content rejects the skin; nothing executes or is fetched.

**Independent Test**: Each `unsafe/<case>` fixture is rejected with the expected code and file.

### Tests for User Story 4

- [X] T028 [P] [US4] Unsafe cases (implemented as an inline table in `packages/skin-format/test/unsafe.test.ts` instead of fixture folders, for readability) — `script/`, `onclick/`, `foreign-object/`, `iframe/`, `external-href/` (`https://…`), `javascript-href/`, `data-svg-href/` (`data:image/svg+xml`), `root-path-href/` (`/x.png`), `css-import/`, `css-external-url/`, `style-attr-url/`, `doctype-entity/` — and test `packages/skin-format/test/unsafe.test.ts` asserting each is rejected with `unsafe-element`, `unsafe-attribute`, `unsafe-reference`, `unsafe-css` or `unsafe-doctype` naming file and element; plus `local-image/` (relative PNG inside the package) and `data-png/` (`data:image/png`) load fine
- [X] T029 [P] [US4] No-network/no-exec test in `packages/skin-format/test/unsafe.test.ts`: stub `globalThis.fetch` and `eval` to throw; loading every unsafe fixture never calls them

### Implementation for User Story 4

- [X] T030 [US4] Unsafe-content detection in `packages/skin-format/src/validate/svg.ts` following research R4 exactly (elements `script`, `foreignObject`, `iframe`, `object`, `embed`, `audio`, `video`, `animate`/`set` targeting `href`; attributes starting with `on`; `href`/`xlink:href` not `#fragment` or relative in-package path, allowing only `data:image/png|jpeg|webp|gif`; CSS `@import` and non-local `url()` in `<style>` and `style=""`; DOCTYPE with internal subset/entities); referenced local images must exist (`missing-file`); add codes to both catalogs

**Checkpoint**: Safety guarantees hold (SC-003).

---

## Phase 6: User Story 3 - Clear feedback on broken skins (Priority: P2)

**Goal**: Every mistake yields a precise, translated report entry; a CLI shows it.

**Independent Test**: Each `broken/<case>` fixture produces exactly the expected code and
params.

### Tests for User Story 3

- [X] T031 [P] [US3] Broken fixtures in `packages/skin-format/test/fixtures/broken/` and table-driven test `packages/skin-format/test/broken.test.ts`: `unknown-binding` (`"crss"` → `schema-invalid-value` error with `field` `/controls/0/bindings/0` and `value` `crss`), `missing-svg-file` (`missing-file`), `unsupported-format` (`format: 2` → `unsupported-format`), `duplicate-control` (`duplicate-control`), `group-unknown-control` (`unknown-control`), `control-in-two-groups`, `duplicate-group`, `invalid-tuning` (stick `deadZone + maxZone ≥ 1`, trigger `maxZone = 1`), `path-outside-package` (`../x.svg` → `schema-invalid-value`)
- [X] T032 [P] [US3] Warning/info test in `packages/skin-format/test/warnings.test.ts`: no menu → warning `no-menu` (still loads); box outside 0–1600 × 0–720 → warning `outside-canvas`; unknown top-level field → warning `unknown-field`; anchor on a grouped control → warning `anchor-ignored`; no preview → info `no-preview`; unreferenced file → info `unused-file`
- [X] T033 [P] [US3] Message rendering test in `packages/skin-format/test/messages.test.ts`: `formatReportEntry` renders the `missing-thumb` entry naming the control in English and Portuguese

### Implementation for User Story 3

- [X] T034 [US3] Skin-level semantics in `packages/skin-format/src/validate/semantics.ts`: `unsupported-format` (checked before the schema so a newer format gives the "update Ninjoy" message), `duplicate-control`, `duplicate-group`, `unknown-control`, `control-in-two-groups`, `invalid-tuning`, `no-menu`, `outside-canvas`, `unknown-field`, `anchor-ignored`, `no-preview`, `unused-file`; messages in both catalogs
- [X] T035 [US3] CLI in `packages/skin-format/src/cli.ts`: `validate <folder|file.ninjoyskin> [--lang en|pt]`, prints one line per entry and a summary `N errors, N warnings`, exit code 1 when errors exist

**Checkpoint**: Authors get actionable feedback (SC-004).

---

## Phase 7: User Story 5 - Skin adapts to other screens (Priority: P2)

**Goal**: Groups and anchors are resolved; the background layer is described.

**Independent Test**: Anchors resolve from group, own anchor or position thirds; background
fields resolve with defaults.

### Tests for User Story 5

- [X] T036 [P] [US5] Anchor/background test in `packages/skin-format/test/layout.test.ts`: group anchor `right` applies to all its controls; ungrouped control with no anchor and box center in the left third → `left`, middle → `center`, right third → `right`; group without anchor → derived from the union of its controls' boxes; implicit one-control groups named after the control; background `{ color, image, placement: "center", opacity: 0.3 }` resolves as given and defaults to color `#000000`, placement `cover`, opacity `1`

### Implementation for User Story 5

- [X] T037 [US5] Anchor, group and background resolution in `packages/skin-format/src/resolve.ts` (rules from `data-model.md` → "Resolution")

---

## Phase 8: User Story 6 - Colors chosen per element (Priority: P3)

**Goal**: Colors, glow, toggle appearance, trigger fill and tuning resolve with inheritance.

**Independent Test**: Resolved values follow element → skin default → SVG/built-in for each
state independently.

### Tests for User Story 6

- [X] T038 [P] [US6] Resolution test in `packages/skin-format/test/resolve.test.ts`: element with only `active` set inherits `inactive` from `defaults.colors[role]`; nothing set → `null` for both (keep SVG colors); `"inherit"` equals omission; descendant of a colored group inherits the group's colors unless it has its own; trigger `maxZone` color defaults to resolved `fill`; `showFill` control → defaults → `true`; glow control → defaults → `{ enabled: true, color: "active" }`; `toggleActive` control → defaults → `true` (only on fullscreen/gyro); tuning control → `defaults.tuning[type]` → built-in

### Implementation for User Story 6

- [X] T039 [US6] Color, glow, toggle, trigger and tuning resolution in `packages/skin-format/src/resolve.ts`, including SVG-group color inheritance using the scanner's `insideGroupIds`

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T040 [P] Performance check in `packages/skin-format/test/performance.test.ts`: loading `skins/ninjoy` 20 times averages under 50 ms in Node (proxy for the plan's phone budget)
- [ ] T041 [P] Update `README.md` with the repository layout (`packages/`, `skins/`, `docs/`) and how to run tests and the validator
- [ ] T042 Run every scenario in `specs/20261019-122142-skin-package-format/quickstart.md` and fix any gap
- [ ] T043 Mark completed tasks in `specs/20261019-122142-skin-package-format/tasks.md` and set **Status** to "Implemented" in `specs/20261019-122142-skin-package-format/spec.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories.
- **US1** (official skin) and **US2** (hand-made skins) only need the foundation.
- **US4** (safety) needs the SVG scanner (T015); independent of US1/US2.
- **US3** (feedback) needs the foundation; its CLI uses `filesFromZip` from US2 for archives.
- **US5** and **US6** need `resolve.ts` from US2 (T025).
- **Polish** after all stories.

### Recommended order (single developer)

T001–T016 → US1 (T017–T020) → US2 (T021–T027) → US4 (T028–T030) → US3 (T031–T035) →
US5 (T036–T037) → US6 (T038–T039) → Polish (T040–T043).

### Parallel opportunities

- Setup: T003, T004, T005 together after T001–T002.
- Foundation: T007–T013 are all different files.
- US1: T019 and T020 alongside T018.
- US2: T021, T022, T023 (tests) together; T026 alongside T024–T025.
- US3: T031, T032, T033 together.
- After the foundation, US1, US2 and US4 can proceed in parallel.

---

## Implementation Strategy

### MVP first

1. Phases 1–2 (foundation).
2. Phase 3 (US1): the official skin as a valid package. **Stop and validate.**

### Incremental delivery

Each following story adds a capability without breaking earlier tests: hand-made skins and
archives (US2), safety (US4), feedback and CLI (US3), layout resolution (US5), color
resolution (US6). Commit after each task or logical group with Conventional Commits
(`feat(skin-format): …`, `test(skin-format): …`, `chore: …`, `docs: …`).
