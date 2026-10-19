# Implementation Plan: Skin Package Format v1

**Branch**: `feat/20261019-122142-skin-package-format` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261019-122142-skin-package-format/spec.md`

## Summary

Deliver the skin package format as a shared, DOM-free TypeScript library
(`@ninjoy/skin-format`) that loads a skin package (folder or `.ninjoyskin` zip), validates it
against a versioned JSON Schema plus semantic rules, rejects unsafe SVG content, resolves
anchors/colors/glow/tuning, and returns a translatable validation report. Ship the official
Ninjoy skin converted into the format, author documentation, a small CLI validator and CI.
This feature also sets up the monorepo that later features (controller page, host) build on.

## Technical Context

**Language/Version**: TypeScript 7 (ES modules), Node.js 26 for tooling and tests

**Primary Dependencies**: `@cfworker/json-schema` 4 (MIT, schema validation without
runtime code generation), `saxes` 6 (ISC, streaming XML parser for SVG scanning), `fflate`
0.8 (MIT, zip). Dev: Vitest 5, TypeScript 7. See [research.md](research.md).

**Storage**: Files only (skin packages); no database.

**Testing**: Vitest unit tests with fixture packages (official skin, minimal skin, broken
and unsafe skins); GitHub Actions CI running lint/type-check/tests.

**Target Platform**: Browsers (controller page on Android/iOS, Studio in Tauri webview) and
Node (tests, CLI). The Rust host will reuse the JSON Schema later.

**Project Type**: Library inside an npm-workspaces monorepo.

**Performance Goals**: Loading and validating the official skin takes < 50 ms on a mid-range
phone (it happens once per skin load, outside the input hot path).

**Constraints**: No DOM, no `eval`/`new Function` (strict CSP on the controller page); never
executes skin content or makes network requests; package ≤ 20 MB; all user-facing report
text in locale catalogs (en, pt).

**Scale/Scope**: ~30 controls per skin, a few hundred KB of SVG; one manifest format version.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Real controller fidelity | Pass | Bindings cover every DS4 input incl. touchpad left/right clicks; the device backend is not touched. |
| II. Zero-install, LAN-only | Pass | Loader never makes network requests; external references are rejected. |
| III. Latency is a requirement | Pass (N/A on hot path) | Skin loading is outside the input path; a load-time budget is still set (< 50 ms). |
| IV. Declarative, safe skins | Pass | Data only; unsafe content rejected; one shared resolution step so every skin behaves the same; 100% layout = drawing; group anchors. |
| V. Spec-driven and tested | Pass | Spec → plan → tasks; every acceptance scenario maps to a Vitest test; CI added in this feature. |
| VI. Simplicity | Pass | Three small runtime dependencies, each justified (R2, R3, R6), all MIT/ISC (GPL-3.0 compatible). No speculative abstraction. |
| Tech constraints (i18n) | Pass | Report codes + en/pt catalogs; no hard-coded user-facing strings. |
| Workflow | Pass | Conventional Commits on `feat/` branch, PR #3. |

Post-design re-check (after Phase 1): still passing. The only design addition beyond the spec
is the `thumb-label` role and multi-element roles (R5), required to represent the official
skin; the spec is updated accordingly.

## Project Structure

### Documentation (this feature)

```text
specs/20261019-122142-skin-package-format/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── skin-manifest.v1.schema.json
│   └── loader-api.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
package.json                      # npm workspaces root (private), shared scripts
tsconfig.base.json
.github/workflows/ci.yml          # install, type-check, test
packages/
└── skin-format/                  # @ninjoy/skin-format
    ├── package.json
    ├── tsconfig.json
    ├── schema/
    │   └── skin-manifest.v1.schema.json
    ├── messages/
    │   ├── en.json
    │   └── pt.json
    ├── src/
    │   ├── index.ts              # public API (contracts/loader-api.md)
    │   ├── constants.ts          # CANVAS, MAX_PACKAGE_BYTES, BUILTIN
    │   ├── files.ts              # filesFromMap, filesFromZip
    │   ├── load.ts               # loadSkin orchestration
    │   ├── report.ts             # ReportEntry, codes, formatReportEntry
    │   ├── validate/
    │   │   ├── schema.ts         # JSON Schema step + error simplification
    │   │   ├── semantics.ts      # cross-references, roles, tuning sums, menu
    │   │   └── svg.ts            # SAX scan: ids + unsafe content
    │   ├── resolve.ts            # anchors, colors, glow, toggleActive, tuning
    │   └── cli.ts                # `validate` command
    └── test/
        ├── fixtures/
        │   ├── minimal/
        │   ├── broken/<case>/
        │   └── unsafe/<case>/
        └── *.test.ts
skins/
└── ninjoy/                       # official skin (not GPL; see TRADEMARKS.md)
    ├── skin.json
    ├── preview.png
    └── controls/*.svg
docs/
└── skins/
    └── format.md                 # author documentation (English)
```

**Structure Decision**: npm-workspaces monorepo. Shared TypeScript libraries live in
`packages/`; the controller page (`controller/`) and the Rust/Tauri host (`host/`) are added
by later features. Official skins live in `skins/` with their own license notice.

## Complexity Tracking

No constitution violations to justify.
