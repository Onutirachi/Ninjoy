# Tasks: Skin Format v2 and Skin Library

**Input**: [spec.md](spec.md), [plan.md](plan.md). Tests are written before the code they cover.

## Format 2 (US3/US4/US5 foundations)

- [X] T001 [P] skin-format tests: format 2 accepted, format 1 unchanged, format 2 features rejected in format 1; colors `original`/`lightbar`/`lightbar N%` resolved; `decor` without touch area; `fixed` groups and `fixed-mixed-group`; stick `output` with defaults and overrides
- [X] T002 Schema, semantics, types and resolve in `packages/skin-format`

## US3/US4/US5 - Page drawing and input (P2)

- [ ] T003 [P] Controller tests: lightbar color follows `--ninjoy-lightbar` and starts from the player color; decor ignores touches (a control under it gets them); fixed groups ignore size and height; d-pad stick presses the 8 directions with hysteresis and leaves the analog stick centered
- [ ] T004 Appearance/lightbar default, hit-test exclusion, layout for fixed groups, d-pad output in `controller/src`

## US1/US2 - Library and choice (P1)

- [ ] T005 [P] Session tests: index lists embedded + folder skins, skips unreadable/broken, serves files (no path escape), default and `SKINS_CHANGED`, `SKIN` recorded in the slot; protocol vectors for the new messages
- [ ] T006 `host/session`: library, routes, messages; devhost `--skins`
- [ ] T007 [P] Controller tests: loads the chosen skin from the host, falls back to the default with a notice, switches at runtime without reconnecting, layout per skin id, menu Skin section, follows `SKINS_CHANGED`
- [ ] T008 `controller/src`: host loader, storage by id, switchable controller in `main.ts`, menu section
- [ ] T009 [P] App core and desktop tests: default skin persisted and applied, snapshot skins and controller skin, broken skins reported; Skins tab lists, sets default, shows broken; no Arcade placeholder; details show the skin
- [ ] T010 `host/app-core`, `host/app` commands, `desktop/src/skins.ts`

## Polish

- [ ] T011 The maintainer's skin v2 in a library folder (PS, lightbar, bottom buttons fixed) and a run on a phone; mark the spec Implemented
