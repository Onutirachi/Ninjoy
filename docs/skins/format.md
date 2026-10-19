# Ninjoy skin format (v1)

A **skin** decides what a Ninjoy touch controller looks like and which DualShock 4 input each
part of it sends. Skins are **data only**: SVG artwork plus a `skin.json` manifest. They never
contain code.

The Skin Studio (coming later) will create skins for you. This page explains the format so you
can also write one by hand.

## 1. The package

A skin is a folder (or the same files zipped into a `.ninjoyskin` file):

```text
my-skin/
├── skin.json          ← the manifest (required)
├── preview.png        ← thumbnail shown in menus (recommended)
└── controls/
    ├── cross.svg      ← one SVG per control
    └── stick-left.svg
```

Rules:

- Total size up to **20 MB**.
- Paths in `skin.json` are relative, use `/`, and never leave the package (`..` is rejected).
- SVGs must be plain artwork. Scripts, event handlers (`onclick`…), `<foreignObject>`,
  links to other servers and CSS that loads external files make the skin **rejected**.
  Images inside an SVG must be files of the package (or `data:image/png|jpeg|webp|gif`).

## 2. The canvas

Every skin is laid out on a fixed **1600 × 720** canvas (20:9, a phone held sideways). At 100%
size on a 20:9 screen the controller looks exactly like your layout. Ninjoy never moves, aligns
or centers your artwork; on other screens whole **groups** slide towards their **anchor**
(see §6).

Each control has a `box` (`x`, `y`, `width`, `height`, in canvas units). Its SVG is fitted
into the box, keeping its proportions, centered.

## 3. Controls

Every control has an `id` (lowercase letters, digits and dashes, unique in the skin), a `type`,
an `svg` and a `box`.

| `type` | Extra fields | Notes |
|---|---|---|
| `button` | `bindings`: list of DS4 buttons | Several bindings = pressed together (e.g. a diagonal `["up", "left"]`). |
| `stick` | `side`: `left` \| `right`; `click`: a button or `none` | `click` is what double-tap-and-hold sends; default `l3` for the left stick, `r3` for the right. |
| `trigger` | `trigger`: `l2` \| `r2`; `direction`: `up` \| `down` \| `left` \| `right` | Analog: force grows in `direction` (default `up`). |
| `touchpad` | `area`: `full` \| `left` \| `right` | Both halves form the single DS4 touchpad. |
| `system` | `action`: `menu` \| `fullscreen` \| `gyro` | Ninjoy functions, not DS4 inputs. |

**Bindings**: `cross`, `circle`, `square`, `triangle`, `up`, `down`, `left`, `right`, `l1`,
`r1`, `l2`, `r2`, `l3`, `r3`, `share`, `options`, `ps`, `touchpad` (touchpad click),
`touchpad-left`, `touchpad-right` (touchpad click on that half).

The same binding may appear on several controls (for example L1 on both sides).

## 4. Element roles

`elements` tells Ninjoy what each part of a control's SVG is. Keys are SVG element `id`s; an id
may be a single shape (`path`, `circle`, `rect`, …) or a group (`g`) — a group counts as one
element and everything inside it shares its role and colors.

| Role | Meaning |
|---|---|
| `base` | Background of the control. Without a hitbox, the union of all base elements is the touch area. |
| `hitbox` | Optional invisible touch area. At most **one**, and it must be a **single shape** (not a group). |
| `label` | Icon or text, shown in both states. |
| `label-on` / `label-off` | Icons for the active (pressed / toggled on) and inactive states. With only one of them, it is used for both. |
| `thumb` | Sticks only (required): the part that follows the finger. It rests where you drew it. |
| `thumb-label` | Sticks only: text/icon that moves with the thumb, colored like a label. |
| `pressed` | Shown only while the control is pressed. |
| `level` | Triggers only: your own fill, revealed by the force (never stretched). |

Elements without a role are decoration. The touch area is exactly the shape — Ninjoy adds no
margin. The whole control becomes active at once when a finger is on its touch area.

A stick's thumb travels inside the ellipse that fits the box of its hitbox (or of its base):
a square hitbox gives a circle, a rectangular one an oval.

## 5. Colors

Each element can have an `inactive` and an `active` color (`#RRGGBB` or `#RRGGBBAA`); each one
may be omitted (or `"inherit"`) independently. A missing color comes from `defaults.colors`
for the element's role, and if that is missing too, the color drawn in the SVG is kept.

```json
"elements": { "ring": { "role": "base", "colors": { "active": "#227DC3" } } }
```

Other appearance settings (skin-wide in `defaults`, some overridable per control):

| Setting | Where | Default |
|---|---|---|
| `glow` `{ enabled, color }` | `defaults.glow`, control `glow` | on, color `"active"` (the element's active base color) |
| `toggleActive` | `defaults.toggleActive`, control `toggleActive` (fullscreen, gyro) | `true`: a toggle that is on looks active |
| trigger `fill`, `maxZone` colors | `defaults.trigger`, trigger `colors` | `#3099E8`; `maxZone` uses `fill` |
| trigger `showFill` | `defaults.trigger.showFill`, trigger `showFill` | `true` |

## 6. Groups and anchors

```json
"groups": [{ "name": "actions", "anchor": "right", "controls": ["triangle", "circle", "cross", "square"] }]
```

When a player shrinks the controller or the screen has another shape, each group moves as one
block towards its `anchor` (`left`, `center` or `right`), keeping its internal arrangement.
A control outside any group is its own group and may have its own `anchor`. Without an anchor,
Ninjoy uses the position: left third → `left`, right third → `right`, otherwise `center`.

## 7. Tuning defaults

Skin defaults that players can change on their device:

```json
"defaults": {
  "tuning": {
    "trigger": { "maxZone": 0.25, "minForce": 0 },
    "stick": { "deadZone": 0.1, "maxZone": 0.05 }
  }
}
```

- `trigger.maxZone`: top part of the trigger that already counts as 100%.
- `trigger.minForce`: force of any touch on the trigger (triggers have no dead zone: lifting the
  finger is zero).
- `stick.deadZone` / `stick.maxZone`: center area that counts as 0 / edge area that counts as 100%.

Values are fractions from 0 to 1. A control may override them with its own `tuning`.

## 8. Background

```json
"background": { "color": "#000000", "image": "background.svg", "placement": "center", "opacity": 0.3 }
```

A layer that fills the whole screen behind the controls. `placement` is `cover`, `contain`,
`center` or `tile`; the image is never distorted. Low `opacity` makes a watermark.

## 9. Complete example

```json
{
  "format": 1,
  "name": "Tiny",
  "author": "You",
  "version": "1.0.0",
  "orientation": "landscape",
  "controls": [
    {
      "id": "cross",
      "type": "button",
      "bindings": ["cross"],
      "svg": "controls/cross.svg",
      "box": { "x": 1350, "y": 420, "width": 160, "height": 160 },
      "elements": { "bg": { "role": "base" }, "icon": { "role": "label" } }
    },
    {
      "id": "stick-left",
      "type": "stick",
      "side": "left",
      "svg": "controls/stick-left.svg",
      "box": { "x": 120, "y": 360, "width": 300, "height": 300 },
      "elements": { "ring": { "role": "base" }, "ball": { "role": "thumb" } }
    },
    {
      "id": "menu",
      "type": "system",
      "action": "menu",
      "svg": "controls/menu.svg",
      "box": { "x": 770, "y": 650, "width": 60, "height": 60 },
      "elements": { "dot": { "role": "base" } }
    }
  ]
}
```

`controls/cross.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle id="bg" cx="50" cy="50" r="50" fill="#1F4A6B"/>
  <path id="icon" d="M30 30 L70 70 M70 30 L30 70" stroke="#C7D5E0" stroke-width="10" stroke-linecap="round"/>
</svg>
```

`controls/stick-left.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle id="ring" cx="50" cy="50" r="50" fill="#1F4A6B"/>
  <circle id="ball" cx="50" cy="50" r="22" fill="#266697"/>
</svg>
```

`controls/menu.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <circle id="dot" cx="5" cy="5" r="5" fill="#1F4A6B"/>
</svg>
```

These four files are a complete, valid skin. To show a thumbnail in menus, add a 1600 × 720
image to the folder and reference it with `"preview": "preview.png"`.

A skin without a `menu` control loads, but players cannot open the Ninjoy menu from it.

## 10. Validating

From the repository root:

```bash
npm run validate --workspace @ninjoy/skin-format -- path/to/my-skin
npm run validate --workspace @ninjoy/skin-format -- my-skin.ninjoyskin --lang pt
```

Every problem is listed with the control or file it concerns. Errors stop the skin from
loading; warnings and notes do not.

The machine-readable definition of `skin.json` is the JSON Schema
[`packages/skin-format/schema/skin-manifest.v1.schema.json`](../../packages/skin-format/schema/skin-manifest.v1.schema.json).
