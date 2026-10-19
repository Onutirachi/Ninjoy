# Data Model: Skin Package Format v1

The authoritative structure is the JSON Schema in
[contracts/skin-manifest.v1.schema.json](contracts/skin-manifest.v1.schema.json). This document
explains the entities, their relationships and the rules that the schema alone cannot express
(marked **semantic**).

## Skin package

A folder, or a `.ninjoyskin` zip containing the folder's files at its root.

| File | Required | Notes |
|---|---|---|
| `skin.json` | yes | The manifest. |
| control SVGs | yes | One per control, any path inside the package (convention: `controls/<id>.svg`). |
| preview image | no | PNG/JPEG/WebP, referenced by `preview`. |
| background image | no | SVG/PNG/JPEG/WebP, referenced by `background.image`. |
| other images | no | Raster images referenced from inside SVGs by relative path. |

Rules:
- Total size ≤ 20 MB (**semantic**, error `package-too-large`).
- Every referenced path is relative, uses `/`, contains no `..` segment and exists in the
  package (**semantic**, error `missing-file` / `path-outside-package`).
- Files not referenced by anything produce an info entry `unused-file`.

## Manifest (`skin.json`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | integer | yes | `1` for this version. Higher → error `unsupported-format` ("update Ninjoy"). |
| `name` | string (1–64) | yes | Skin name. |
| `author` | string (1–64) | yes | |
| `version` | string (semver) | yes | Skin version, e.g. `1.2.0`. |
| `orientation` | `"landscape"` | yes | Only value in v1. |
| `preview` | path | no | Missing → info `no-preview`. |
| `background` | Background | no | |
| `defaults` | Defaults | no | Skin-wide colors, glow, toggle appearance and tuning. |
| `groups` | Group[] | no | |
| `controls` | Control[] (≥ 1) | yes | |

Unknown top-level fields → warning `unknown-field` (forward compatibility; the schema allows
additional properties only at the top level and inside `extensions`).

The canvas is always 1600 × 720 units; it is not stored in the manifest.

## Background

| Field | Type | Default | Notes |
|---|---|---|---|
| `color` | Color | `#000000` | |
| `image` | path | none | SVG or raster. |
| `placement` | `cover` \| `contain` \| `center` \| `tile` | `cover` | The image is never distorted. |
| `opacity` | number 0–1 | `1` | Lower values make a watermark. |

## Defaults

| Field | Type | Notes |
|---|---|---|
| `colors` | `{ [role]: ColorPair }` | Default colors per role (see Element). |
| `trigger` | `{ fill?: Color, maxZone?: Color, showFill?: boolean }` | Trigger fill and 100% zone colors (`maxZone` defaults to `fill`); `showFill` default `true`. |
| `glow` | Glow | Default `{ enabled: true, color: "active" }`. |
| `toggleActive` | boolean | Whether a toggle that is on uses the active appearance. Default `true`. |
| `tuning` | `{ trigger?: TriggerTuning, stick?: StickTuning }` | |

- **ColorPair**: `{ inactive?: Color, active?: Color }`. Omitted or `"inherit"` → inherit.
- **Color**: `#RRGGBB`, `#RRGGBBAA` or `"inherit"`.
- **Glow**: `{ enabled?: boolean, color?: Color | "active" }`.
- **TriggerTuning**: `{ maxZone?: 0–1, minForce?: 0–1 }`. Built-in: `maxZone 0.25`, `minForce 0`.
- **StickTuning**: `{ deadZone?: 0–1, maxZone?: 0–1 }`. Built-in: `deadZone 0.10`, `maxZone 0.05`.
- **semantic**: `deadZone + maxZone < 1` for sticks; `maxZone < 1` for triggers (error
  `invalid-tuning`).

## Group

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Unique among groups (**semantic**, error `duplicate-group`). |
| `anchor` | `left` \| `center` \| `right` | no | Omitted → derived from the group's horizontal center. |
| `controls` | control id[] (≥ 1) | yes | Each id must exist (error `unknown-control`) and belong to at most one group (error `control-in-two-groups`). |

## Control

Common fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string `[a-z0-9-]+` | yes | Unique within the skin (error `duplicate-control`). |
| `type` | `button` \| `stick` \| `trigger` \| `touchpad` \| `system` | yes | Selects the type-specific fields below. |
| `svg` | path | yes | The control's artwork. |
| `box` | `{ x, y, width, height }` | yes | Canvas units; width/height > 0. Outside 0–1600 × 0–720 → warning `outside-canvas`. The SVG is fitted into the box preserving its aspect ratio, centered. |
| `elements` | `{ [svgElementId]: Element }` | no | Roles and colors of SVG elements. |
| `anchor` | Anchor | no | Only for controls outside groups; inside a group → warning `anchor-ignored`. |
| `glow` | Glow | no | Overrides `defaults.glow`. |

Type-specific fields:

| Type | Fields |
|---|---|
| `button` | `bindings`: Binding[] (≥ 1, unique) |
| `stick` | `side`: `left` \| `right`; `click?`: Binding \| `none` (double-tap-and-hold; default `l3` for left, `r3` for right); `tuning?`: StickTuning |
| `trigger` | `trigger`: `l2` \| `r2`; `direction?`: `up` \| `down` \| `left` \| `right` (default `up`); `colors?`: `{ fill?, maxZone? }`; `showFill?`: boolean; `tuning?`: TriggerTuning |
| `touchpad` | `area`: `full` \| `left` \| `right` |
| `system` | `action`: `menu` \| `fullscreen` \| `gyro`; `toggleActive?`: boolean (only for `fullscreen`, `gyro`) |

**Binding** values: `cross`, `circle`, `square`, `triangle`, `up`, `down`, `left`, `right`,
`l1`, `r1`, `l2`, `r2`, `l3`, `r3`, `share`, `options`, `ps`, `touchpad`, `touchpad-left`,
`touchpad-right`.

## Element

An entry of `control.elements`, keyed by an SVG element id. The id may belong to a single
shape (`path`, `circle`, `ellipse`, `rect`, `polygon`, `polyline`, `line`, `text`) or to a
group (`g`); a group counts as one element and its role and colors apply to all its
descendants. A descendant listed separately overrides the group for itself.

| Field | Type | Notes |
|---|---|---|
| `role` | Role | Omitted → decoration (colors may still be set). |
| `colors` | ColorPair | Overrides the role default; each of the two colors inherits independently. |

**Role** values and rules (all **semantic**):

| Role | Applies to | Count | Notes |
|---|---|---|---|
| `hitbox` | all | 0 or 1, single shape | The exact touch area; invisible. A group → error `hitbox-not-single-shape`; more than one → error `too-many-hitboxes`. |
| `base` | all | ≥ 0; ≥ 1 without hitbox | Without a hitbox the touch area is the union of all base elements; none → error `missing-touch-area`. |
| `label` | all | ≥ 0 | Shown in both states unless label-on/off exist. |
| `label-on` | all | ≥ 0 | Shown while active (pressed / toggle on). |
| `label-off` | all | ≥ 0 | Shown while inactive. Only one of the pair present → used for both states. |
| `thumb` | stick | ≥ 1 for sticks | Moves with the finger; rests where drawn. Elsewhere → error `role-not-allowed`. |
| `thumb-label` | stick | ≥ 0 | Moves with the thumb, colored with `label` defaults. Elsewhere → error `role-not-allowed`. |
| `pressed` | all | ≥ 0 | Visible only while pressed. |
| `level` | trigger | ≥ 0 | Custom fill revealed by force. Elsewhere → warning `role-ignored`. |

- Every key of `elements` must be an id present in the control's SVG (error `unknown-element`).
- A stick without any `thumb` element → error `missing-thumb`.
- An element listed both as a group and inside another listed group with a different role →
  error `conflicting-roles`.
- The trigger fill is masked by the union of all base elements, so several base paths work.
- Stick travel and trigger force use the bounding box of the touch area (hitbox, or union of
  base elements).
- A base-union touch area may consist of separate pieces; the loader cannot detect this (it
  does not render geometry). The Studio shows the touch area and warns about separate pieces.
- Elements are never moved, aligned or centered; only the stick thumb moves (FR-014b, FR-015).
- The whole control is active or inactive at once; elements only differ in their colors.

## Skin-level rules (semantic)

- No control with `type: system, action: menu` → warning `no-menu`.
- The same binding used by several controls is allowed.
- Overlapping boxes are allowed.

## Resolution (what the loader returns)

For every control the loader returns resolved values, so renderers never re-implement the rules:

- **anchor**: group anchor → control anchor → derived from the box center (left third →
  `left`, right third → `right`, otherwise `center`; for groups, the center of the union of
  their controls' boxes).
- **element colors**: for each element and each state, element value → `defaults.colors[role]`
  → `null` (keep the color drawn in the SVG).
- **trigger colors**: control `colors` → `defaults.trigger` → built-in; `maxZone` falls back
  to the resolved `fill`.
- **trigger showFill**: control `showFill` → `defaults.trigger.showFill` → `true`.
- **glow**: control `glow` → `defaults.glow` → built-in (enabled, color `active`).
- **toggleActive**: control → `defaults.toggleActive` → `true`.
- **tuning**: control `tuning` → `defaults.tuning[type]` → built-in.

## Validation report

| Field | Type | Notes |
|---|---|---|
| `severity` | `error` \| `warning` \| `info` | Any error → skin not loaded. |
| `code` | string | Stable identifier (e.g. `missing-thumb`). |
| `params` | object | `control`, `file`, `field`, `value`, `element`, ... as relevant. |

Messages are rendered from locale catalogs (`en`, `pt`) by code; see
[contracts/loader-api.md](contracts/loader-api.md).
