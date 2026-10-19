# Data Model: Controller Page Touch Engine v1

## Controller state (output)

Published after every change; see [contracts/controller-state.md](contracts/controller-state.md).

| Field | Type | Notes |
|---|---|---|
| `seq` | integer | Increments on every change. |
| `time` | ms (monotonic) | When the change happened. |
| `buttons` | set of DS4 buttons | cross, circle, square, triangle, up, down, left, right, l1, r1, l2, r2, l3, r3, share, options, ps, touchpad (click). |
| `sticks.left` / `sticks.right` | `{ x, y }`, each −1…1 | y positive = down (screen direction). 0 when idle. |
| `triggers.l2` / `triggers.r2` | 0…1 | Max over all controls bound to that trigger; a button bound to L2/R2 gives 1. |
| `touchpad.touches` | ≤ 2 × `{ id, x, y }`, x/y 0…1 over the whole DS4 touchpad | The two most recent touches. |
| `gyro` | boolean | Gyro toggle. |
| `motion` | `{ rate: {x,y,z} °/s, accel: {x,y,z} m/s², time }` or null | Controller frame; null when gyro is off or no sensor. |

Derived rules:
- Digital `l2`/`r2` buttons are set while the corresponding force is > 0.
- The same binding on several controls is OR-ed (buttons) or max-ed (forces).
- Two controls of the same stick side: the one whose finger was taken most recently wins.

## Finger

| Field | Notes |
|---|---|
| `id` | Pointer id. |
| `x`, `y` | Screen position (CSS px). |
| `downAt` | Time the finger touched. |
| `stick` | The stick that owns this finger (taken on first touch of any stick), or none. |
| `stickTakenAt` | When the stick took it (newest wins). |
| `click` | True when this finger started a double-tap-and-hold on its stick. |
| `entered` | Per trigger/touchpad: time the finger entered it (last-entered wins; most recent touchpad touches). |

Lifecycle: `down → move* → (up | cancel | lost capture | page hidden/blur | menu opened)`.
On any end, the finger is removed and the state recomputed; no other path removes fingers.

Double-tap: per stick, remember `lastTapUpAt` when a finger owned by it lifts less than 250 ms
after being taken; a new finger taken within 300 ms of that sets `click = true`.

## Player settings (per device)

| Field | Range | Default |
|---|---|---|
| `size` | 0.4–1, or `auto` | `auto` = clamp(430 / screen height px, 0.4, 1) |
| `height` | 0–1 | 0 |
| `finger` | 0–40 px radius | 14 |
| `stickDeadZone` | 0–0.40 | skin default (built-in 0.10) |
| `stickMaxZone` | 0–0.30 | skin default (0.05) |
| `triggerMinForce` | 0–0.50 | skin default (0) |
| `triggerMaxZone` | 0–0.50 | skin default (0.25) |
| `gyro` | boolean | true |
| `language` | `auto` \| `en` \| `pt` | `auto` |

Player zone values, once changed, override the skin defaults; "reset to skin" clears them.

## Layout edits (per device, per skin)

`{ [groupName]: { dx, dy, scale } }` — `dx`, `dy` in canvas units relative to the group's
anchor (scaled by the global size, so edits follow the size slider); `scale` 0.5–2 around the
group's own center.

## Control overrides (per device, per skin)

`{ [controlId]: { inherit: boolean, stickDeadZone?, stickMaxZone?, triggerMinForce?, triggerMaxZone? } }`.
When `inherit` is true (default) the menu values apply; when false the stored values apply,
initialized from the current menu values.

## Layout transform (per group)

With screen aspect `A`, view height `VH = 720`, view width `VW = 720·A`,
`fit = min(1, VW / 1600)`, `g = fit · size`, `lift = height · max(0, VH − 720·g)`:

```
T = translate(sx, VH − lift) · scale(g) · translate(−ax, −720)   # anchor + global size
  · translate(dx, dy)                                            # player drag (canvas units)
  · translate(cx, cy) · scale(s) · translate(−cx, −cy)            # player scale around center
```

`ax` / `sx` = anchor x on the canvas / on the screen: left `0 / 0`, center `800 / VW/2`,
right `1600 / VW`; `(cx, cy)` = center of the group's boxes on the canvas.
