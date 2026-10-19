# Feature Specification: Controller Page Touch Engine v1

**Feature Branch**: `feat/20261019-151001-controller-touch-engine`

**Created**: 2026-10-19

**Status**: Implemented

**Input**: User description: "Controller page touch engine v1 for Ninjoy: the page that runs in
the player's phone/tablet browser, renders a skin and turns touches into a DualShock 4
controller state."

## Overview

The controller page is what each player sees on their phone or tablet. It draws a skin (a
resolved skin from the skin package format feature), reacts to the player's fingers exactly
like a physical controller would, and continuously produces a **DualShock 4 controller
state**. In this feature the page runs on its own: the connection to the Ninjoy host and the
wire protocol are a separate feature that will send this state. A development mode shows the
state on screen so the behavior can be checked without a host.

Every behavior below was validated by the maintainer in an interactive prototype; it must be
reproduced exactly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Press buttons like a real controller (Priority: P1)

A player presses buttons with their thumbs, slides a thumb from one button to another, and
presses two neighbouring buttons with one thumb, exactly like on a physical controller.

**Why this priority**: This is the core of the product; without reliable buttons nothing else
matters.

**Independent Test**: Load the official skin in development mode, touch, slide and release on
buttons, and watch the state.

**Acceptance Scenarios**:

1. **Given** a finger lands on ✕, **When** it stays, **Then** cross is pressed; **When** it
   lifts, **Then** cross is released.
2. **Given** a finger on ✕, **When** it slides onto ○ without lifting, **Then** cross is
   released and circle is pressed as soon as the finger circle leaves ✕ and reaches ○.
3. **Given** the finger circle overlaps both △ and ○, **When** it stays, **Then** both are
   pressed.
4. **Given** finger size 0, **When** the touch point is 1 px outside the drawn edge of a
   button, **Then** the button is not pressed (no invisible margin).
5. **Given** two fingers on the same button, **When** one lifts, **Then** the button stays
   pressed until the other lifts.
6. **Given** any combination of touches, **When** all fingers lift, are cancelled by the
   system, leave the screen, or the page loses focus, **Then** no control remains active.

---

### User Story 2 - Use analog sticks (Priority: P1)

A player moves a stick with their thumb, can slide the thumb beyond the stick and keep
steering (and even press another button with the same thumb), and clicks L3/R3 by
double-tapping.

**Why this priority**: Most games need sticks; the "keep steering outside" behavior is what
makes one-thumb combinations possible.

**Independent Test**: Drag on a stick in development mode and read its values and the thumb
position; perform a double-tap-and-hold.

**Acceptance Scenarios**:

1. **Given** a finger touches the stick, **When** it moves, **Then** the stick value follows
   the finger relative to the center of the touch area, from −1 to 1 on each axis.
2. **Given** a finger on a stick, **When** it moves outside the stick, **Then** the stick keeps
   following it (value saturates at the edge) until the finger lifts, and the same finger also
   presses any button it is over.
3. **Given** the thumb is drawn off-center, **When** the stick is idle, **Then** the thumb
   stays where it was drawn; **When** used, **Then** the thumb's center follows the finger
   inside the allowed ellipse; **When** released, **Then** it returns to its drawn position.
4. **Given** a rectangular hitbox, **When** the finger is far to the side, **Then** the thumb
   stops at the edge of the ellipse inscribed in that box (minus the thumb's own size), width
   and height independent.
5. **Given** a touch, **When** the thumb is drawn, **Then** it glides smoothly to the finger and
   back to rest on release, while the stick value changes immediately.
6. **Given** dead zone 10% and 100% zone 5%, **When** the finger is within 10% of the travel
   from the center, **Then** the value is 0; **When** beyond 95%, **Then** the magnitude is 1.
7. **Given** a tap shorter than 250 ms on a stick, **When** another touch follows within 300 ms
   and is held, **Then** the stick's click binding (default L3 / R3) is held until release and
   the stick keeps moving with the finger.
8. **Given** two fingers on one stick, **When** the newer one lifts, **Then** the older finger
   takes over.

---

### User Story 3 - Use analog triggers (Priority: P1)

A player presses a long trigger: higher on the trigger is stronger, the top quarter is full
force, and the trigger fills with color to show the force.

**Why this priority**: Driving and shooting games depend on analog triggers.

**Independent Test**: Touch a trigger at several heights and read the force; watch the fill.

**Acceptance Scenarios**:

1. **Given** a trigger with direction "up" and 100% zone 25%, **When** the finger is at 40% of
   its height, **Then** the force is 40/75 ≈ 0.53; **When** at 80%, **Then** the force is 1.
2. **Given** minimum force 10%, **When** the finger touches the very bottom, **Then** the force
   is 0.10; **When** the finger lifts, **Then** the force is 0.
3. **Given** a finger already on the trigger, **When** a second finger enters it, **Then** the
   second finger decides the force; **When** the second lifts, **Then** the first decides again.
4. **Given** the trigger is not touched, **Then** no fill or zone is visible; **When** pressed,
   **Then** the fill follows the finger, cut to the trigger's base shapes, more opaque the
   stronger the force, and the 100% zone appears faintly, becoming fully opaque at 100%.
5. **Given** the skin hides the trigger fill, **When** pressed, **Then** the trigger shows the
   normal active appearance and still sends force.

---

### User Story 4 - Touchpad, system controls and motion (Priority: P2)

A player uses the touchpad halves and their click buttons, opens the Ninjoy menu, toggles
fullscreen and toggles the gyroscope; tilting the phone produces motion data.

**Why this priority**: Needed for Steam Input touchpad/gyro use and for the menu, but buttons,
sticks and triggers come first.

**Independent Test**: Touch the touchpad halves, tap the click buttons and system controls,
tilt the device; read the state.

**Acceptance Scenarios**:

1. **Given** a finger on the left touchpad half at its center, **Then** the state reports a
   touch at (0.25, 0.5) of the single DS4 touchpad; on the right half's center, (0.75, 0.5).
2. **Given** three fingers on touchpad areas, **Then** only the two most recent are reported.
3. **Given** no finger on the touchpad, **When** the touchpad-left click button is pressed,
   **Then** the touchpad click is pressed and a touch is reported on the left half.
4. **Given** the menu control, **When** the finger lifts from it, **Then** the player menu
   opens (pressing alone does nothing).
5. **Given** the fullscreen control on a browser that supports fullscreen, **When** tapped,
   **Then** fullscreen toggles and the control shows its on/off appearance; on a browser
   without fullscreen, **Then** a notice explains how to add the page to the home screen.
6. **Given** gyro is on, **When** the device rotates, **Then** the state contains rotation rate
   and acceleration in the controller's frame regardless of which way the phone is held in
   landscape; **When** gyro is off, **Then** motion values are zero and the gyro flag is off.
7. **Given** a browser that requires permission for motion, **When** gyro is first enabled,
   **Then** the page asks for permission; if denied, gyro stays off and a notice explains why.

---

### User Story 5 - Fit any screen and hand (Priority: P2)

A player on a 10" tablet or a wide phone gets a comfortable controller: controls near the
thumbs, a size and height they choose, and controls moved where they like.

**Why this priority**: Without it, tablets are unusable; but the default phone experience
works without it.

**Independent Test**: Load the official skin at 20:9, 16:9 and 4:3 sizes, change size and
height, move and resize a group, reload.

**Acceptance Scenarios**:

1. **Given** a 20:9 screen at 100% size, **Then** every control is exactly where the skin
   drew it.
2. **Given** a wider screen, **Then** left- and right-anchored groups stay at their edges and
   the extra space is in the middle; **Given** a 4:3 screen, **Then** the whole skin shrinks
   to fit the width.
3. **Given** automatic size, **When** the screen is ~430 CSS px tall (landscape phone), **Then**
   size is 100%; **When** it is ~770 CSS px tall (10" tablet), **Then** size is about 56%.
4. **Given** size below 100%, **Then** each group shrinks towards its anchor at the bottom;
   **When** the height slider is raised, **Then** the whole controller moves up within the free
   space.
5. **Given** edit layout mode, **When** the player drags a group and resizes it, **Then** it
   moves and scales around its own center; **When** the size slider changes afterwards,
   **Then** the edited layout scales consistently (relative positions preserved); **When** the
   page reloads, **Then** the edits are still there; **When** reset is chosen, **Then** the
   skin's layout returns.

---

### User Story 6 - Player menu and personal settings (Priority: P2)

A player opens the menu and adjusts size, height, finger size, stick and trigger zones, gyro,
fullscreen, layout editing and language; each trigger or stick can have its own zones.

**Why this priority**: Comfort and accessibility; defaults already work.

**Independent Test**: Change each setting, observe the effect, reload and confirm it persisted.

**Acceptance Scenarios**:

1. **Given** the menu, **When** finger size changes, **Then** hit testing uses the new radius
   immediately.
2. **Given** the menu, **When** stick or trigger zones change, **Then** every stick/trigger that
   inherits uses the new values immediately.
3. **Given** edit layout mode, **When** the player selects a trigger and turns off "inherit from
   menu", **Then** that trigger starts from the menu values and can be changed alone.
4. **Given** a browser in Portuguese, **When** the page opens, **Then** the menu is in
   Portuguese; in any other language not available, **Then** English; **When** the player picks
   a language, **Then** it is used from then on.
5. **Given** any setting changed, **When** the page reloads on the same device, **Then** the
   setting is kept; **Then** the skin files are unchanged.

---

### User Story 7 - Clear visual feedback (Priority: P2)

Pressed controls look pressed in the way the skin's artist designed: active colors, alternate
icons, optional glow and pressed artwork.

**Why this priority**: Players need to see what they press, but input works without it.

**Independent Test**: Press controls of the official skin and compare with the colors and
icons declared by the skin.

**Acceptance Scenarios**:

1. **Given** a control is active, **Then** every element shows its resolved active color and
   all elements change at the same time; **When** inactive, **Then** their inactive colors (or
   the SVG's own colors).
2. **Given** a control with label-on and label-off, **Then** label-on shows while active and
   label-off while inactive; with only one icon, it shows in both states.
3. **Given** glow is enabled, **Then** an active control has a concentrated glow in the glow
   color (or its active base color); **Given** glow disabled, **Then** no glow.
4. **Given** gyro is on and the skin keeps toggles active, **Then** the gyro control looks
   active while on; **Given** the skin opts out, **Then** it looks normal while on.
5. **Given** a device that can vibrate, **When** a control becomes active, **Then** a short
   vibration happens; on devices that cannot, nothing happens.

---

### Edge Cases

- A finger that lands on no control and slides onto one presses it when it arrives.
- A finger on a stick also presses buttons it passes over; lifting releases everything it held.
- Very fast taps (shorter than one frame) still register press and release.
- Rotating the device or resizing the window re-lays out the skin; fingers on the screen keep
  their controls without getting stuck.
- The menu opened while fingers are down: all controls are released.
- Two sticks touched by the same finger: the first stick grabbed keeps it.
- A skin without a menu control: the page still works; the menu is unreachable (no extra
  button is added).
- Settings stored by an older version of the page are ignored if unreadable (defaults used).
- Browser denies vibration or motion silently: the page keeps working without them.

## Requirements *(mandatory)*

### Functional Requirements

**Rendering and layout**

- **FR-001**: The page MUST draw the skin background layer and each control's artwork in its
  box, never moving, aligning or centering any element except the stick thumb.
- **FR-002**: At 100% size on a 20:9 screen the layout MUST match the skin's canvas exactly.
- **FR-003**: Each group MUST be anchored to the left edge, center or right edge of the screen
  and to the bottom; extra width goes between the groups; screens narrower than 20:9 MUST
  scale the whole layout down to fit the width.
- **FR-004**: The controller size MUST be adjustable from 40% to 100%, with an automatic value
  equal to min(1, 430 / screen height in CSS px) clamped to at least 40%. Groups shrink towards
  their anchor at the bottom.
- **FR-005**: A height setting (0–100%) MUST move the whole controller up by that share of the
  free vertical space.
- **FR-006**: In edit layout mode the player MUST be able to drag any group (or ungrouped
  control) and resize it from 50% to 200% around its own center. Edits are stored per device
  and per skin, expressed relative to the anchor so they scale with the size setting, and can
  be reset. Anchors cannot be changed by the player.

**Touch**

- **FR-007**: Each touch MUST be treated as a circle of the configured finger radius
  (default 14 CSS px, range 0–40). A control is touched when the circle overlaps its touch
  area: the hitbox shape, otherwise the union of its base shapes. Outlines count only when
  they are visibly drawn. No margin is added.
- **FR-008**: One finger MAY touch several controls; moving a finger MUST update which controls
  it touches on every movement.
- **FR-009**: A button MUST be pressed while at least one finger touches it.
- **FR-010**: A stick MUST take a finger as soon as the finger touches it and keep it until the
  finger lifts, even when the finger leaves the stick. With several fingers, the most recently
  taken one controls the stick; when it lifts, the previous one takes over.
- **FR-011**: Stick value: the finger offset from the center of the touch-area box, divided by
  the travel (half the box size minus half the thumb size, per axis), clamped to the unit
  ellipse, then the radial dead zone and 100% zone applied to its magnitude.
- **FR-012**: The thumb drawing MUST rest at its drawn position; while active its center MUST
  follow the clamped finger position; transitions to the finger and back to rest MUST be
  smoothed visually (about 25 ms when following, 45 ms when returning) without delaying the
  stick value.
- **FR-013**: Double-tap-and-hold on a stick (a touch shorter than 250 ms, then a new touch
  within 300 ms) MUST hold the stick's click binding until that touch lifts; `none` disables
  it. The stick keeps moving normally while the click is held.
- **FR-014**: Trigger force: the finger position along the trigger direction within the
  touch-area box gives a raw value r from 0 to 1; with 100% zone z and minimum force m,
  force = m + (1 − m) × min(1, r / (1 − z)); no touch = 0. With several fingers on a trigger,
  the finger that entered it last decides; when it leaves, the previous one decides.
- **FR-015**: Touchpad areas MUST report each touching finger as a point normalized over the
  single DS4 touchpad (left half → x in 0–0.5, right half → 0.5–1, full → 0–1); at most the two
  most recent touches are reported. Touchpad-left/right click buttons MUST press the touchpad
  click and, when no finger is on the touchpad, report a touch at the center of that half.
- **FR-016**: System controls MUST act when the finger lifts: menu opens the player menu;
  fullscreen toggles fullscreen (or shows the home-screen notice where unsupported); gyro
  toggles motion sensing.
- **FR-017**: When all fingers lift or are cancelled, when the page loses focus or visibility,
  or when the menu opens, every control MUST be released and the state cleared.

**Appearance**

- **FR-018**: A control is active as a whole while touched (toggles: while on, unless the skin
  disables the active look for toggles). Active and inactive element colors, label-on/off,
  pressed elements and glow MUST follow the resolved skin.
- **FR-019**: Trigger fill MUST be clipped to the union of the trigger's base shapes, grow with
  the finger along the direction, have an opacity increasing with the force, and show the 100%
  zone only while pressed (faint at low force, fully opaque at 100%); when the skin hides the
  fill, the trigger uses the normal active appearance.
- **FR-020**: When a control becomes active, the device SHOULD vibrate briefly (about 12 ms)
  if supported.

**Motion**

- **FR-021**: While gyro is on, the page MUST read the device rotation rate and acceleration,
  convert them to the controller's frame using the current screen orientation, and include
  them with their timestamp in the state. Where the browser requires permission, it MUST be
  requested from a user gesture; if denied, gyro stays off with a notice.

**Menu and settings**

- **FR-022**: The player menu MUST offer: size (with automatic), height, finger size, stick
  dead zone (0–40%) and 100% zone (0–30%), trigger minimum force (0–50%) and 100% zone (0–50%),
  gyro on/off, fullscreen, edit layout, reset layout, language.
- **FR-023**: In edit layout mode, selecting a trigger or stick MUST offer an "inherit from
  menu" option; when off, that control's zones are set individually, starting from the menu
  values.
- **FR-024**: Defaults for zones come from the resolved skin; player values override them;
  all player settings and layout edits MUST be stored on the device per skin and MUST NOT
  change the skin.
- **FR-025**: The interface text MUST be available in English and Portuguese, chosen from the
  browser language with English as fallback, and changeable in the menu.
- **FR-026**: When a feature is unavailable on the device (fullscreen, vibration, motion), the
  page MUST tell the player once, in their language.

**Output**

- **FR-027**: The page MUST maintain a controller state: DS4 buttons, both sticks (−1…1),
  L2/R2 force (0…1), touchpad touches (up to 2, normalized) and click, motion (rotation rate,
  acceleration, timestamp), gyro flag. The state MUST be updated in the same frame as the
  touch or sensor event that changes it, and consumers MUST be able to subscribe to changes.
- **FR-028**: A development mode MUST show the live state on screen.

### Key Entities

- **Controller state**: the DS4 inputs plus motion and Ninjoy flags, with a timestamp; the
  only output of this feature.
- **Player settings**: size (or automatic), height, finger size, zones, gyro preference,
  language; per device.
- **Layout edits**: per skin and per group/control, an offset and a scale relative to the
  anchor.
- **Control overrides**: per skin and per trigger/stick, inherit flag and zone values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every behavior in the acceptance scenarios above is covered by an automated
  test that passes in CI.
- **SC-002**: The state reflects each touch within one screen refresh (16 ms), and processing
  one touch event on the official skin takes under 2 ms on a mid-range phone.
- **SC-003**: After any sequence of touches ends, zero controls remain active (verified by
  randomized touch-sequence tests).
- **SC-004**: At 100% size on a 20:9 screen every control of the official skin is within 1
  screen pixel of its drawn position.
- **SC-005**: On a 10" tablet with automatic size, both sticks and the face buttons are within
  thumb reach of the lower corners (each group's lower outer corner within 15% of the screen
  width from its edge).
- **SC-006**: A player can change any menu setting in under 10 seconds, and settings survive
  closing and reopening the page.

## Assumptions

- The page receives a resolved skin from `@ninjoy/skin-format`; how it obtains it from the host
  belongs to the protocol feature. For now the official skin is bundled.
- Target browsers: current Chrome on Android, Safari on iOS/iPadOS, and desktop browsers for
  development; landscape orientation only.
- "Same frame" means the state changes during handling of the triggering event, before the
  next screen refresh.
- The automatic size reference (430 CSS px) and the smoothing durations come from the
  prototype and may be tuned later without changing behavior.
- Rumble, lightbar color and other feedback from games arrive through the protocol feature and
  are out of scope here; the local vibration on press is in scope.
- Choosing a skin from the host, the Skin Studio and pressure sensing are out of scope.
