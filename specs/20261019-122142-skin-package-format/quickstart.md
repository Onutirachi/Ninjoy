# Quickstart: validating the skin package format v1

How to prove the feature works end to end. Details of the format are in
[data-model.md](data-model.md) and [contracts/](contracts/).

## Prerequisites

- Node.js 26 (npm 11) — `node --version`
- Repository cloned; from the repository root:

```bash
npm install
```

## 1. Run the test suite

```bash
npm test --workspace @ninjoy/skin-format
```

Expected: all tests pass, including:

| Test group | Proves |
|---|---|
| official skin | `skins/ninjoy` loads with zero errors and zero warnings; every DS4 input, both touchpad clicks, menu, fullscreen and gyro are present (US1, SC-001). |
| hand-made minimal skin | a two-control package written from the docs loads and resolves bindings, thumb and trigger direction (US2). |
| broken skins | each fixture produces exactly the expected error code naming the control/file/field (US3, SC-004). |
| unsafe skins | script, event handler, foreign object, external href, CSS `url()`/`@import` and DOCTYPE entities are each rejected (US4, SC-003). |
| resolution | anchors (group, own, derived by thirds), color inheritance per element and per state, trigger colors (`maxZone` defaults to `fill`), glow, `toggleActive`, tuning fallbacks (US5, US6). |
| messages | every report code has an English and a Portuguese message. |
| schema parity | the schema in `packages/skin-format/schema/` is identical to the one in this spec's `contracts/`. |

## 2. Validate a skin from the command line

```bash
npm run validate --workspace @ninjoy/skin-format -- skins/ninjoy
npm run validate --workspace @ninjoy/skin-format -- path/to/my-skin.ninjoyskin
```

Expected for the official skin: `0 errors, 0 warnings` and the list of controls. For a broken
skin: one line per report entry in the chosen language (`--lang pt`).

## 3. Write a skin by hand (SC-002)

Follow [docs/skins/format.md](../../docs/skins/format.md) to create a package with one button
and one stick, then run step 2 on it. Target: working skin in under 30 minutes without
reading source code.

## 4. Check the official skin visually

Open the official skin in the local preview tool used during design (not part of the
product) or, once the touch engine feature lands, in the controller page, on a 20:9 screen at
100% size: the layout must match the original drawing.
