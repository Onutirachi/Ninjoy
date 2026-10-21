# Implementation Plan: Skin Format v2 and Skin Library

**Branch**: `feat/20261021-153515-skin-format-v2` | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

## Summary

Format 2 in `packages/skin-format` (lightbar/original colors, `decor`, `fixed`, stick d-pad
output), the controller page drawing and running them, a skin library served by the host
(official skin embedded plus a user folder), the page loading its skin from the host with a
per-phone choice and runtime switching, and the desktop Skins tab choosing the default.

## Technical Context

**Language/Version**: TypeScript 7 (skin-format, controller, desktop), Rust 2024 (session, app).
**Primary Dependencies**: none new.
**Testing**: skin-format unit tests (schema, semantics, resolve), controller unit + browser
tests, session protocol vectors and integration tests, app-core tests, desktop UI tests.
**Constraints**: format 1 skins unchanged; no executable content in skins (constitution IV).

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Fidelity | Pass | D-pad output uses the DS4 d-pad; nothing else changes on the device. |
| II. Zero-install | Pass | Skins come from the host over the LAN. |
| III. Latency | Pass | Lightbar colors are a CSS variable (no work per state); d-pad sector math is a few operations. |
| IV. Skins | Pass | Still SVG + manifest; the page validates every skin it loads; decorations are drawn only. |
| V. Tested | Pass | Each story has tests at the layer it changes. |
| VI. Simplicity | Pass | One schema with `format` 1 or 2; fixed handled per group (an existing layout unit). |

## Design

- **Format** (`packages/skin-format`): schema `format` 1|2 (`FORMAT_VERSION = 2`); colors accept
  `original`, `lightbar` and `lightbar N%`; type `decor` (any roles, no bindings, no touch-area
  requirement); `fixed: boolean` on any control; stick `output: "analog" | "dpad"` and
  `defaults.stick.output`. Format 2 features in a format 1 manifest are an error. Resolve:
  `original` → `null` (explicit), `lightbar` → `var(--ninjoy-lightbar)`, `lightbar N%` →
  `color-mix(in srgb, var(--ninjoy-lightbar) N%, transparent)`; groups get `fixed` (all members
  fixed; mixing is an error `fixed-mixed-group`); ungrouped fixed controls form fixed implicit
  groups; sticks get `output`.
- **Page drawing**: `--ninjoy-lightbar` is always set on `<html>` (default player color for the
  slot number until the game sets one), so lightbar fills just work; `decor` controls render and
  get appearance but are skipped by hit testing and input; fixed groups use size 1 and height 0
  in `groupTransform` (edit-layout offsets still apply); d-pad sticks press up/down/left/right
  from the zoned value's angle (8 sectors of 45°, ±7.5° hysteresis kept per stick) and leave the
  analog stick centered.
- **Library on the host** (`host/session`): `SessionConfig.skins_dir` (user skins, one folder
  per id) plus the official skin embedded from `skins/`; `GET /skins/index.json` → `{ default,
  skins: [{ id, name, author, version, format, files }] }` (only folders with a readable
  `skin.json` of format ≤ 2 and not marked broken); `GET /skins/<id>/<file>`; `Session::skins()`,
  `set_default_skin(id)`, `set_broken_skins(ids)`; host → page message `SKINS_CHANGED` (0x89, no
  payload) to every connection when the library or default changes; page → host message `SKIN`
  (0x06, id UTF-8 ≤ 64 bytes) recorded in the slot (`SlotInfo.skin`).
- **Page loading/switching** (`controller`): `loadSkinFromHost(id)` builds `SkinFiles` from the
  index's file list and `fetch`; the chosen id is stored per phone (`ninjoy.v1.skin`); layout and
  overrides keyed by skin id (the old `name@version` keys are migrated once for the official
  skin); `main.ts` keeps a mutable controller: switching disposes the old one, creates the new
  one, re-subscribes the session, rebuilds menu and edit toolbar, sends a neutral state then the
  new state, and reports `SKIN`; the menu gets a Skin section (previews, default and current
  marked); on `SKINS_CHANGED` the page refetches the index and switches when needed.
- **Desktop** (`host/app-core`, `host/app`, `desktop`): settings `default_skin`; snapshot gains
  `skins` (id, name, author, version, default, broken reason) and each controller's `skin`;
  commands `skin_file(id, path)` (bytes, for previews and validation) and `set_default_skin`;
  the window validates each skin with `@ninjoy/skin-format` and reports broken ones
  (`set_broken_skins`); the Skins tab lists them, chooses the default, shows broken ones; the
  Arcade placeholder goes; details show the phone's skin.
- **Developer host**: `--skins DIR` for the user skins folder.
