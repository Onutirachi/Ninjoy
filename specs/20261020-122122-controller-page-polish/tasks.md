# Tasks: Controller Page Polish

**Input**: [spec.md](spec.md), [plan.md](plan.md). Tests are written before the code they cover.

## US1 - Tap to play (P1)

- [X] T001 [P] [US1] Browser test `controller/test/browser/start.test.ts`: the start screen shows the controller number and a large button; the tap requests the wake lock (stub), asks motion permission only when gyro is on and required (stub), never requests fullscreen; the wake lock is re-requested when the page becomes visible
- [X] T002 [US1] `controller/src/platform/wake-lock.ts` (`keepAwake`, injectable `navigator.wakeLock`) and `controller/src/ui/start.ts`
- [X] T003 [US1] `controller/src/main.ts`: show the start screen on the first `joined` of the page load; texts in `controller/src/i18n/{en,pt}.json`; expose a motion-permission request on the controller API (`controller.requestMotion()`)

## US2 - Touchpad click (P1)

- [X] T004 [P] [US2] Unit test in `controller/test/unit/fingers.test.ts`: `TapClick` — tap < 250 ms then a touch within 300 ms clicks; long taps and late touches do not
- [X] T005 [P] [US2] Browser test `controller/test/browser/system.test.ts`: double tap and hold on each touchpad half presses `touchpad` with the finger's touch reported on that half; a plain touch/drag does not click
- [X] T006 [US2] `TapClick` in `controller/src/engine/fingers.ts`; touchpad click handling in `controller/src/dom/controller.ts`
- [X] T007 [US2] Official skin: remove the click buttons, move the center controls up 50 units, update the reference boxes fixture, tests counting controls and `skins/ninjoy/preview.png`

## US3 - Controller list and notices (P2)

- [ ] T008 [P] [US3] Browser test additions in `controller/test/browser/screens.test.ts`: the rotate notice is inactive until activated; the controller list uses the still variant with the watermark
- [X] T009 [US3] `watchOrientation(...).setActive()` and its use in `controller/src/main.ts`
- [ ] T010 [US3] Controller list redesign in `controller/src/ui/lobby.ts`, `controller/src/ui/screens.ts`, `controller/src/ui/styles.css`

## US4 - Vibration (P3)

- [X] T011 [US4] `controller/src/platform/rumble.ts`: no `vibrate(0)` before the first vibration; test in `controller/test/browser/feedback.test.ts`

## Polish

- [ ] T012 Run the page on a phone with the spike host (tap to play, touchpad clicks in Steam, list upright) and mark the spec Implemented
