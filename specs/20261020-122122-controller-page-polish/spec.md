# Feature Specification: Controller Page Polish

**Feature Branch**: `feat/20261020-122122-controller-page-polish`

**Created**: 2026-10-20

**Status**: Draft

**Input**: Feedback from the maintainer's first test of the controller with a virtual DualShock 4
in Steam: start with a "tap to play" screen, keep the screen awake, click the touchpad with a
double tap instead of separate click buttons, show the "turn sideways" notice only on the
controller, a richer controller list usable upright, and no browser errors from vibration.

## Overview

Small changes to the controller page delivered by the touch engine and LAN session features.
They make the first seconds smoother and the touchpad behave like a real DualShock 4, where the
single touchpad click is reported together with the finger's position (Steam tells "left" and
"right" clicks apart by that position).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tap to play (Priority: P1)

Before the controller appears, the player taps one large button. That tap lets the browser keep
the screen awake, use vibration and (on iPhone) ask for motion sensors.

**Why this priority**: Without a tap, browsers block vibration and the iPhone motion permission,
and the screen turns off during play.

**Independent Test**: Open the controller on a phone, tap "Tap to play", leave it idle for a few
minutes and check the screen stays on; check vibration works on the first press.

**Acceptance Scenarios**:

1. **Given** the player joined a controller, **Then** a "tap to play" screen shows the
   controller number and one large button; the controller is not usable until the tap.
2. **Given** the tap, **Then** the screen stays awake while the controller page is visible
   (where the browser supports it), and vibration is allowed.
3. **Given** gyro is on and the browser needs permission (iPhone), **Then** the permission is
   asked on that tap.
4. **Given** the page reconnects (Wi-Fi blip) or the player comes back to the tab, **Then** the
   controller resumes without another "tap to play"; the screen is kept awake again.
5. **Given** the tap, **Then** fullscreen is **not** forced; the fullscreen control and the menu
   keep working as before.

---

### User Story 2 - Click the touchpad like a DualShock 4 (Priority: P1)

The player double-taps and holds on a touchpad area to press the touchpad click, at that finger's
position, so Steam sees a left or right click depending on the half.

**Why this priority**: Steam maps the left and right touchpad clicks by the finger position;
this makes the touchpad usable without extra buttons.

**Independent Test**: In Steam's controller test, double-tap and hold on the left touchpad area,
then on the right one.

**Acceptance Scenarios**:

1. **Given** a finger taps a touchpad area (shorter than 250 ms) and touches it again within
   300 ms, **When** it holds, **Then** the touchpad click is pressed while the finger stays down,
   and the finger's touch keeps being reported at its position.
2. **Given** a normal touch or drag on a touchpad area, **Then** no click is pressed.
3. **Given** the official skin, **Then** it no longer has the separate left/right click buttons,
   and the buttons below the touchpads are moved up to close the gap. Skins may still use
   `touchpad-left`/`touchpad-right` click buttons, which keep working as before.

---

### User Story 3 - Friendlier controller list and notices (Priority: P2)

The controller list is comfortable with the phone upright, and the "turn sideways" notice only
appears when the controller itself is on screen.

**Why this priority**: The list is the first screen a player sees when they open `ninjoy.local`.

**Independent Test**: Open `ninjoy.local` with the phone upright and sideways; join a
controller upright.

**Acceptance Scenarios**:

1. **Given** the controller list, explanation page or any notice, **Then** no "turn sideways"
   notice is shown, whatever the orientation.
2. **Given** a joined controller on an upright phone, **Then** the "turn sideways" notice shows.
3. **Given** the controller list, **Then** it shows large cards (controller number, status,
   "back to controller N" for this device, "new controller"), usable upright and sideways, over
   a still background with a large ninja watermark like the desktop app (no moving pattern).

---

### User Story 4 - No vibration errors (Priority: P3)

**Acceptance Scenarios**:

1. **Given** the page has not vibrated yet, **When** the status changes or the page is hidden,
   **Then** the page does not call the vibration API (browsers report that as an error before
   the first tap).

### User Story 5 - Motion in the right frame (Priority: P2)

Found while testing the virtual DS4 prototype in Steam: turning the phone like a steering wheel
moved the camera up and down, and gravity read upside down. Measured on an Android phone held
sideways: Chrome reports `rotationRate.alpha` around the device's x axis, `beta` around y and
`gamma` around z, and the page rotated x/y by the screen angle in the wrong direction.

**Acceptance Scenarios**:

1. **Given** a phone held sideways and upright with the screen toward the player, **When** it is
   still, **Then** the page reports gravity as +9.8 m/s² up the screen (y).
2. **Given** the same phone, **When** it turns like a door, tilts its top away or turns like a
   steering wheel, **Then** the rotation is reported around the screen's y, x and z axes.

### Edge Cases

- Screen wake lock unsupported or refused: the controller works; no notice (the screen may turn
  off as before).
- The page goes to the background and comes back: the wake lock is requested again.
- A finger already on the touchpad is moved by another finger's double tap: only the finger that
  double-tapped presses the click.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After joining a controller, the page MUST show a "tap to play" screen (controller
  number, one large button) until the first tap; reconnections and returning to the page MUST NOT
  show it again during the same page load.
- **FR-002**: On that tap the page MUST request the screen wake lock (re-requested whenever the
  page becomes visible again), ask for motion permission when gyro is on and the browser requires
  it, and MUST NOT force fullscreen.
- **FR-003**: A double tap and hold (tap < 250 ms, new touch within 300 ms, same rules as the stick
  click) on a touchpad area MUST press the DualShock 4 touchpad click while that finger stays down;
  its touch keeps being reported.
- **FR-004**: The official skin MUST drop the left/right click buttons and move the controls below
  the touchpads up by 50 canvas units; its preview and reference boxes are updated.
- **FR-005**: The "turn sideways" notice MUST show only while a joined controller is on screen.
- **FR-006**: The controller list MUST use large cards readable upright and sideways, a still
  background and a large ninja watermark; texts stay in the en/pt catalogs.
- **FR-007**: The page MUST NOT call the vibration API before it has vibrated at least once. Any
  rumble MUST be felt (pulses of at least 30 ms per 100 ms cycle), and a repeated rumble of the same
  strength MUST NOT restart the vibration. After the game stops rumbling the phone MUST keep
  vibrating 150 ms (a motor spinning down), so quick on/off bursts (a machine gun) feel continuous.
- **FR-009**: The menu MUST offer vibration "game and buttons" (default), "game only" and "off";
  button taps MUST NOT vibrate while the game rumbles (the browser keeps one vibration, so a tap
  would cut the game's).
- **FR-008**: Motion MUST be reported in the screen frame (x right, y up the screen, z toward the
  player) in every landscape direction; a phone held upright toward the player maps one to one to
  a DualShock 4 lying flat.

## Success Criteria *(mandatory)*

- **SC-001**: In Steam's controller test, a double tap and hold on each touchpad half is shown as
  a click on that half in 10 of 10 tries.
- **SC-002**: With the controller idle for 5 minutes on Android Chrome (HTTPS), the screen stays
  on.
- **SC-003**: Opening a controller produces no errors in the browser console.

## Assumptions

- Wake lock needs the secure page; on the plain fallback the screen may still turn off.
- Locking the orientation needs fullscreen on Android and is not possible on iPhone; it is out of
  scope since fullscreen stays optional.
- The virtual DualShock 4 (including reporting at a steady rate, which the spike showed Steam
  needs) is a separate feature.
