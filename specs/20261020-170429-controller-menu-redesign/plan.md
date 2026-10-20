# Implementation Plan: Controller Menu Redesign

**Branch**: `feat/20261020-170429-controller-menu-redesign` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

Page-only change in `controller/`: the player menu is rebuilt in the host UI style approved in the
prototype (`drafts/controller-menu`, not published): a raised side list of sections, the main
area flat on the same dark surface as the header, a plain close "X", settings as rows without
cards, vertical size/height sliders, a see-through menu while a slider is dragged, and zone
previews drawn on the controller.

## Technical Context

**Language/Version**: TypeScript 7, Vite 8 (existing `controller/` app).
**Primary Dependencies**: none new; the brand SVGs (`assets/brand/logo-word.svg`,
`logo-ninja.svg`) and the bundled Manrope / Chakra Petch fonts already used by the page.
**Testing**: Vitest browser tests (Playwright/Chromium).
**Constraints**: no new dependencies; texts in the en/pt catalogs; settings model unchanged.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Fidelity | Pass | No change to the input path or device. |
| II. Zero-install | Pass | Browser features only; unsupported settings shown disabled with a reason. |
| III. Latency | Pass | The menu releases every control when it opens, as today; previews draw only while dragging. |
| IV. Skins | Pass | Zone previews use the resolved skin boxes; the skin format is untouched. |
| V. Tested | Pass | Each story gets browser tests (see tasks). |
| VI. Simplicity | Pass | Native range inputs styled with CSS keep keyboard and screen reader support. |

## Design

- **Structure** (`ui/menu.ts`): dialog panel = header (wordmark, "N Controller" chip while
  joined, plain close button; a visually hidden `h2` keeps the dialog's title) + side list
  (`role="tablist"`, sections Layout, Touch, Motion, Vibration, General; icons only below 430 px
  of height) + main area with every section rendered and only the active one shown, so the
  selected section survives re-renders (language change, gyro state). The ninja watermark sits
  behind the main area at low opacity.
- **Sliders** (`ui/widgets.ts`): native `<input type="range">` styled with CSS (track, fill via a
  `--fill` custom property, knob). Vertical ones use `writing-mode: vertical-lr; direction: rtl`
  so up means more. A `peek` option: `pointerdown` on the input adds `nj-peek` to the overlay and
  `dragging` to its row; `pointerup`/`pointercancel` on the window (and `change`) remove them.
  CSS makes everything but the dragging row transparent and gives that row a translucent surface.
  Keyboard changes never set `nj-peek`.
- **Zone previews** (`dom/controller.ts`): `controller.previewZones("stick" | "trigger" | null)`
  draws a layer over the controller with each stick's dead zone (filled ellipse) and max zone
  (band up to the travel ellipse, using the same travel as the stick math), or each trigger's max
  zone band at its strong end and minimum force at its weak end, using each control's effective
  zones (overrides included). The zone sliders call it on drag start and with `null` on release;
  values update live through `updateSettings`.
- **Vibration**: four radio options (`role="radiogroup"`), game ones tagged "experimental"; the
  strength slider taps through `controller.previewTap()` at most every 150 ms and is disabled
  when buttons do not vibrate.
- **Support**: `controller.support` exposes `{ motion, vibration }` so the gyro switch and the
  vibration section show disabled with a reason when unavailable.
- **General**: fullscreen / edit layout / reset layout as icon buttons; language as a segmented
  radio group.
- **Menu options**: `subtitle()` is replaced by `slot()` (number or null) for the header chip.

## Project Structure

```text
controller/src/ui/menu.ts          rebuilt
controller/src/ui/widgets.ts       range slider gains vertical + peek; radio group, switch, icon button
controller/src/ui/icons.ts         section and action icons (inline SVG paths)
controller/src/ui/styles.css       menu styles (replaces the old panel rules used only by the menu)
controller/src/dom/controller.ts   previewZones, support
controller/src/main.ts             slot() for the header
controller/src/i18n/{en,pt}.json   section names, hints, reasons
controller/test/browser/menu.test.ts
```
