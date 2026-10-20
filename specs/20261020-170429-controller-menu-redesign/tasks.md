# Tasks: Controller Menu Redesign

**Input**: [spec.md](spec.md), [plan.md](plan.md). Tests are written before the code they cover.

## US2 - Sections in the Ninjoy look (P1)

- [X] T001 [US2] Browser tests in `controller/test/browser/menu.test.ts`: header shows the wordmark, "N" chip while joined and a close button; five sections in a tab list, one shown at a time, the chosen one kept across a language change; every control at least 44 × 44 px; gyro and vibration disabled with a reason when unsupported; existing menu tests updated to the new structure
- [X] T002 [US2] `controller/src/ui/widgets.ts` (radio group, switch, icon button), `controller/src/ui/icons.ts`, `controller/src/ui/menu.ts` structure, `controller.support` in `controller/src/dom/controller.ts`, `slot()` in `controller/src/main.ts`, styles in `controller/src/ui/styles.css`, texts in `controller/src/i18n/{en,pt}.json`

## US1 - Layout while seeing the controller (P1)

- [X] T003 [US1] Browser tests: size and height are vertical range inputs; dragging (pointerdown) a layout or zone slider makes the menu see-through except that row, release or cancel brings it back, keyboard changes never do
- [X] T004 [US1] Vertical sliders and the `peek` behavior in `controller/src/ui/widgets.ts` and the menu styles

## US3 - Zone previews (P2)

- [X] T005 [US3] Browser tests: dragging a stick zone slider shows a dead zone and max zone on each stick sized from the values (an override shows its own values); trigger sliders show the bands on each trigger; release removes them
- [X] T006 [US3] `controller.previewZones()` in `controller/src/dom/controller.ts` and its use from the zone sliders

## US4 - Vibration (P3)

- [X] T007 [US4] Browser tests: four modes as a radio group with the game ones tagged experimental; the strength slider taps at most every 150 ms while dragged and is disabled in "game only" and "off"
- [X] T008 [US4] Vibration section in `controller/src/ui/menu.ts`

## Polish

- [ ] T009 Screenshots on a phone held sideways and a tablet (`drafts/`, not published), run on a phone with the host, and mark the spec Implemented
