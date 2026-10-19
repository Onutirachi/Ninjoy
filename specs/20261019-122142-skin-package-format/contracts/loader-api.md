# Contract: `@ninjoy/skin-format` public API

The package is consumed by the controller page (browser), the future Skin Studio (browser /
Tauri webview) and tests (Node). It has no DOM dependency. All functions are pure apart from
reading the provided files.

## Files

```ts
/** Read-only view of a skin package. Paths are relative, '/'-separated. */
interface SkinFiles {
  list(): string[];
  read(path: string): Promise<Uint8Array>;
}

/** In-memory package (tests, Studio). Strings are UTF-8 encoded. */
function filesFromMap(files: Record<string, Uint8Array | string>): SkinFiles;

/** A `.ninjoyskin` zip archive. Rejects archives over the size limit before inflating. */
function filesFromZip(archive: Uint8Array): SkinFiles;
```

## Loading

```ts
function loadSkin(files: SkinFiles): Promise<LoadResult>;

type LoadResult =
  | { ok: true; skin: ResolvedSkin; report: ReportEntry[] }   // no errors
  | { ok: false; report: ReportEntry[] };                      // at least one error

interface ReportEntry {
  severity: "error" | "warning" | "info";
  code: ReportCode;                 // stable, e.g. "missing-thumb"
  params: Record<string, string | number>;
}
```

Order of checks (all problems are collected, not only the first):
1. Package size and manifest presence (`missing-manifest`, `package-too-large`).
2. Manifest JSON parse (`invalid-json`) and schema validation (`schema`, with `field` = JSON
   pointer and `value`).
3. Semantic rules from [data-model.md](../data-model.md).
4. Each referenced SVG: parse (`invalid-svg`), unsafe content (`unsafe-element`,
   `unsafe-attribute`, `unsafe-reference`, `unsafe-css`, `unsafe-doctype`), element ids
   referenced by `elements` (`unknown-element`).

## Resolved skin

```ts
interface ResolvedSkin {
  canvas: { width: 1600; height: 720 };
  meta: { name: string; author: string; version: string; format: 1 };
  background: { color: string; image?: string; placement: "cover" | "contain" | "center" | "tile"; opacity: number } | null;
  preview?: string;
  controls: ResolvedControl[];
  groups: { name: string; anchor: Anchor; controls: string[] }[];   // includes one implicit group per ungrouped control
}

interface ResolvedControl {
  id: string;
  type: "button" | "stick" | "trigger" | "touchpad" | "system";
  svg: { path: string; text: string };        // validated, unmodified SVG source
  box: { x: number; y: number; width: number; height: number };
  anchor: Anchor;                             // already resolved
  group: string;                              // group name (implicit groups: the control id)
  elements: ResolvedElement[];
  glow: { enabled: boolean; color: string | "active" };
  // type-specific, resolved
  bindings?: Binding[];
  side?: "left" | "right";
  trigger?: { which: "l2" | "r2"; direction: "up" | "down" | "left" | "right"; showFill: boolean; fill: string; maxZone: string; tuning: { maxZone: number; minForce: number } };
  stick?: { click: Binding | "none"; tuning: { deadZone: number; maxZone: number } };
  area?: "full" | "left" | "right";
  action?: "menu" | "fullscreen" | "gyro";
  toggleActive?: boolean;                     // fullscreen and gyro only
}

interface ResolvedElement {
  id: string;
  role: Role | null;                          // null = decoration
  colors: { inactive: string | null; active: string | null };  // null = keep the SVG's own color
}

type Anchor = "left" | "center" | "right";
```

## Messages

```ts
type Locale = "en" | "pt";
/** Human-readable message for a report entry, e.g. "Stick 'stick-left' has no thumb." */
function formatReportEntry(entry: ReportEntry, locale: Locale): string;
```

Catalogs live in the package (`messages/en.json`, `messages/pt.json`); every `ReportCode`
has an entry in every catalog (enforced by a test).

## Schema

```ts
/** The JSON Schema (draft 2020-12) for skin.json, for tools and the Rust host. */
const skinManifestSchema: object;
```

The same schema file is published in the repository at
`packages/skin-format/schema/skin-manifest.v1.schema.json`.

## Constants

```ts
const CANVAS = { width: 1600, height: 720 } as const;
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const BUILTIN = {
  trigger: { maxZone: 0.25, minForce: 0, fill: "#3099E8", showFill: true },
  stick: { deadZone: 0.1, maxZone: 0.05 },
  glow: { enabled: true, color: "active" },
  toggleActive: true,
} as const;
```
