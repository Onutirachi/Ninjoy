# Research: Skin Package Format v1

All decisions below resolve the open points of the Technical Context in [plan.md](plan.md).
Versions were checked on 2026-10-19 with `npm view`.

## R1. Single source of truth for the manifest

- **Decision**: A JSON Schema (draft 2020-12) file, `skin-manifest.v1.schema.json`, describes the
  manifest structure. Rules the schema cannot express (cross-references, SVG contents, role
  counts) live in a semantic validation step implemented in TypeScript.
- **Rationale**: The host (Rust) must validate the same manifests later. JSON Schema is
  supported by mature validators in both ecosystems (TypeScript now; the Rust `jsonschema`
  crate later), so the structure is defined once.
- **Alternatives considered**: TypeScript-only types/validators (Zod and similar): no Rust
  equivalent, the format would be defined twice. Custom YAML/TOML: no benefit for a format
  that tools (the Studio) write.

## R2. JSON Schema validator for TypeScript

- **Decision**: `@cfworker/json-schema` 4.x (MIT).
- **Rationale**: Interprets the schema without generating code at runtime, so it works under a
  strict Content Security Policy on the controller page (no `eval`/`new Function`). Small,
  zero dependencies, supports draft 2020-12, runs in browsers and Node.
- **Alternatives considered**: Ajv 8 (MIT, very popular): compiles schemas with
  `new Function` at runtime, which conflicts with a strict CSP; its standalone (build-time)
  mode would avoid that but adds a code-generation build step. Kept as fallback if
  `@cfworker/json-schema` ever becomes unmaintained (last release 2025-01; the schema feature
  set we use is small and stable).

## R3. Reading SVG files without a browser DOM

- **Decision**: Scan SVG files with `saxes` 6.x (ISC), a streaming, standards-conformant XML
  parser, to (a) collect element ids and (b) detect unsafe content.
- **Rationale**: The same code must run in the browser, in Node tests and be portable to Rust.
  A SAX scan does not build or render a DOM, so it never executes or fetches anything, and it
  behaves identically everywhere. `saxes` is stable (6.0.0, 2022) with no runtime
  dependencies.
- **Alternatives considered**: Browser `DOMParser`: unavailable in Node without jsdom/happy-dom
  and could differ between engines. Regex scanning: unreliable for XML (comments, CDATA,
  entities).

## R4. Unsafe-content rules

- **Decision**: A skin is rejected (error) when any SVG contains:
  - elements `script`, `foreignObject`, `iframe`, `object`, `embed`, `audio`, `video`,
    `animate`/`set` targeting `href`;
  - any attribute whose name starts with `on` (event handlers);
  - `href` / `xlink:href` values that are not `#fragment` references or relative paths to
    files inside the package (anything with a scheme such as `http:`, `data:` except
    `data:image/png|jpeg|webp|gif`, `javascript:`, or starting with `//` or `/`);
  - CSS (in `<style>` or `style=""`) containing `@import` or `url(...)` that is not
    `#fragment` or a relative package path;
  - a DOCTYPE with an internal subset or entity declarations (XXE / billion-laughs).
- **Rationale**: Covers code execution, network access and parser abuse. Clean artwork from
  vector tools (CorelDRAW, Inkscape, Illustrator, Figma) never needs any of these. Rejecting is
  simpler and safer than cleaning; cleaning is the Studio's job at import time.
- **Alternatives considered**: Sanitizing (remove and continue): more code paths and a skin
  author might ship something that silently looks different from what they tested.

## R5. Identifying SVG elements for roles and colors

- **Decision**: Elements are referenced by their SVG `id`. The manifest maps ids to a role and
  optional colors. A role may cover several elements (an icon made of two paths, a composite
  base). A new role `thumb-label` marks icons that move with the stick thumb but are colored
  as labels.
- **Rationale**: Ids are the only stable, tool-independent handle on SVG elements; the Studio
  will generate them. Real artwork (the official skin) has multi-path icons and a label on the
  thumb, which a one-element-per-role rule cannot express.
- **Alternatives considered**: CSS-selector-like paths (fragile across tools); class names
  (collide with the tools' own generated classes, e.g. CorelDRAW `fil1`).

## R6. Archive form

- **Decision**: A zip file with extension `.ninjoyskin`, containing the package folder's files at
  its root. Read with `fflate` 0.8.x (MIT).
- **Rationale**: Zip is universal (Workshop uploads, sharing). `fflate` is small, fast,
  dependency-free and runs in browsers and Node.
- **Alternatives considered**: tar (less familiar on Windows), custom container (no benefit).

## R7. Workspace tooling

- **Decision**: npm workspaces (npm 11, bundled with Node 26), TypeScript 7, Vitest 5,
  ES modules only.
- **Rationale**: npm ships with Node; pnpm would require an extra global install because
  Node 26 no longer bundles corepack. Vitest runs TypeScript tests directly and works for both
  Node and browser targets later (controller page).
- **Alternatives considered**: pnpm (better disk usage, but extra tooling for contributors),
  Jest (slower TS setup).

## R8. Human-readable, translatable reports

- **Decision**: Each report entry has a stable `code`, a severity and parameters (control id,
  file, field, value). Messages are rendered from locale catalogs (`en`, `pt`) shipped with the
  package; the UI picks the locale.
- **Rationale**: The constitution forbids hard-coded user-facing text outside locale files, and
  skin authors may speak Portuguese or English.

## R9. Converting the official Ninjoy skin

- **Decision**: One-time conversion of the local layer-named draft into the new package, done
  with a throwaway browser script (bounding boxes need SVG rendering). Only the resulting
  package (`skins/ninjoy/`) is committed; the converter is not part of the product.
- **Rationale**: Importing layer-named SVGs is out of scope (spec). The Studio will later
  recreate the official skin and replace this conversion.

## R10. Colors

- **Decision**: Colors are `#RRGGBB` or `#RRGGBBAA` strings, or the keyword `inherit`
  (equivalent to omitting the value). Glow color may also be `active`, meaning "same as the
  element's resolved active base color".
- **Rationale**: Unambiguous, easy to validate with a pattern, maps directly to SVG/CSS and to
  color pickers in the Studio.
