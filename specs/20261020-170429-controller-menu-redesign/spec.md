# Feature Specification: Controller Menu Redesign

**Feature Branch**: `feat/20261020-170429-controller-menu-redesign`

**Created**: 2026-10-20

**Status**: Implemented

**Input**: The maintainer finds the controller page's player menu too plain: a stacked list of
sliders, toggles, selects and buttons without Ninjoy's look. Redesign it in the host UI style,
with vertical sliders for size and height, a menu that turns transparent while a slider is
dragged so the player sees the controller change, clear sections, live previews of the touch
zones, and the vibration options from the page polish feature.

## Overview

The menu opens from the skin's menu control and changes per-device player settings that apply
and save at once. This feature changes how the menu looks and how its settings are adjusted;
the settings themselves, their ranges and where they are stored stay as they are.

The look follows the host desktop UI prototype: a dark surface built from tonal layers with
layered shadows (depth), the Ninjoy fonts, and the accent blue for active and focused elements.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adjust the layout while seeing the controller (Priority: P1)

The player opens the menu and drags the size or height slider. The menu fades away, leaving only
that slider, so the player watches the controller grow, shrink or move under the finger. Lifting
the finger brings the menu back.

**Why this priority**: Size and height are the settings players change most, and today the open
menu hides the controller they are adjusting.

**Independent Test**: Open the menu on a phone held sideways, drag the size slider, check the
controller is visible and changing during the drag and the menu returns on release.

**Acceptance Scenarios**:

1. **Given** the menu is open, **Then** size and height are vertical sliders: up means bigger
   (size) and higher on the screen (height), with the current value shown next to each.
2. **Given** the player starts dragging a size, height or zone slider, **Then** the whole menu
   except that slider (track, handle and value) becomes transparent, and the controller behind
   it is visible and updates live.
3. **Given** the player lifts the finger (or it is cancelled, e.g. the finger leaves the screen),
   **Then** the menu fades back in with the new value applied and saved.
4. **Given** a slider is changed by keyboard or assistive technology, **Then** the value changes
   in steps and the menu stays visible.

---

### User Story 2 - Find every setting in a clear, Ninjoy-looking menu (Priority: P1)

The menu shows its settings grouped in sections with the Ninjoy look, readable and usable with
fingers on a phone held sideways and on tablets.

**Why this priority**: The redesign is the point of the feature; it also makes room for the
settings added recently (vibration mode and strength).

**Independent Test**: Open the menu on a phone and on a tablet, find each setting by its section
and change it with one finger.

**Acceptance Scenarios**:

1. **Given** the menu opens, **Then** its header shows the Ninjoy wordmark, "Controller N" while
   joined, and a close button; the settings are grouped in sections: **Layout** (size, height),
   **Touch** (finger size, stick dead zone and max zone, trigger minimum force and max zone,
   reset zones), **Motion** (gyroscope), **Vibration** (mode, button strength) and **General**
   (fullscreen, edit layout, reset layout, language).
2. **Given** a phone held sideways (around 360 px tall), **Then** every section is reachable with
   one tap, and no section needs more than one screen of scrolling to reach its last setting.
3. **Given** any control in the menu, **Then** its touch target is at least 44 × 44 CSS px and its
   pressed, focused and disabled looks follow the host UI style.
4. **Given** the menu is open, **Then** touches on it never reach the controller underneath, and
   closing it (close button, tapping outside the panel, or the menu control again) returns to the
   controller.
5. **Given** a setting the device cannot use (no motion sensors, no vibration), **Then** it is
   shown disabled with a short reason instead of disappearing.

---

### User Story 3 - See the touch zones while adjusting them (Priority: P2)

While dragging a stick or trigger zone slider, the zone is drawn on the controller: the stick's
dead zone and max zone as rings around the stick, the trigger's maximum zone as a band at its
strong end.

**Why this priority**: Zone values are percentages that mean little without seeing them; the
preview turns them into something the player can judge.

**Independent Test**: Drag the stick dead zone slider and check a ring on each stick grows and
shrinks with the value; release and check the rings go away.

**Acceptance Scenarios**:

1. **Given** the player drags the stick dead zone or max zone slider, **Then** each stick shows
   its dead zone (inner ring) and max zone (outer band) at the current values until the finger
   is lifted.
2. **Given** the player drags the trigger minimum force or max zone slider, **Then** each
   trigger shows its max zone as a band at the strong end and its minimum force as a fill level,
   until the finger is lifted.
3. **Given** a control has its own zones set in edit-layout mode, **Then** its preview shows its
   own values (the menu changes only the inherited ones).

---

### User Story 4 - Vibration choices that explain themselves (Priority: P3)

The vibration section offers the four modes (game and buttons, game only, buttons only, off),
marks the game ones as experimental, and lets the player feel the button strength while dragging
its slider.

**Why this priority**: The behavior exists already; this story gives it the new look and a short
explanation.

**Independent Test**: Open the vibration section, pick each mode, drag the strength slider and
feel the taps.

**Acceptance Scenarios**:

1. **Given** the vibration section, **Then** the modes are shown as one choice of four with
   "buttons only" as the default and the game modes labeled experimental with a one-line note.
2. **Given** the player drags the button strength slider, **Then** the phone taps at the current
   strength while dragging (no more than one tap every 150 ms) and the menu stays visible.
3. **Given** the mode is "game only" or "off", **Then** the strength slider is disabled.

### Edge Cases

- The menu is opened while a finger still holds a control: that control keeps working until the
  finger lifts; new touches go to the menu.
- The screen rotates or resizes while a slider is being dragged: the drag continues and the menu
  comes back on release.
- Two fingers on the menu: only the first one dragging a slider moves it.
- The connection drops or the host kicks the controller while the menu is open: the session
  screens appear above the menu as today.
- Edit-layout mode is entered from the menu: the menu closes first, as today.
- Very large tablets: the panel keeps a comfortable maximum width instead of stretching.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Size and height MUST be adjusted with vertical sliders (up = bigger / higher),
  showing their current value.
- **FR-002**: While a size, height or zone slider is dragged by touch or mouse, everything in the
  menu except that slider MUST be transparent, the controller behind MUST stay visible and update
  live, and the menu MUST return when the drag ends or is cancelled.
- **FR-003**: The menu MUST group settings in the sections Layout, Touch, Motion, Vibration and
  General with the contents listed in User Story 2.
- **FR-004**: The menu MUST follow the host UI style (depth surfaces, Ninjoy fonts, accent blue)
  and keep touch targets of at least 44 × 44 CSS px.
- **FR-005**: The header MUST show the Ninjoy wordmark, "Controller N" while joined and a close
  button.
- **FR-006**: Dragging a stick or trigger zone slider MUST draw the corresponding zones on the
  controller's sticks or triggers until the drag ends.
- **FR-007**: The vibration section MUST offer the four modes with the game ones labeled
  experimental, and a button strength slider that taps while dragged (at most one tap per
  150 ms) and is disabled when buttons do not vibrate.
- **FR-008**: Settings MUST keep applying and saving at once, with the same values, ranges and
  per-device storage as today; texts MUST come from the en/pt catalogs.
- **FR-009**: Every control MUST be reachable and operable by keyboard, with visible focus and
  accessible names; sliders MUST expose their value; the menu MUST be announced as a dialog.
- **FR-010**: Settings the device cannot use MUST be shown disabled with a short reason.

### Key Entities

- **Player settings**: the existing per-device settings (size, height, finger size, zone
  overrides, gyro, vibration mode, button strength, language); unchanged by this feature.
- **Menu section**: a titled group of settings, in the order Layout, Touch, Motion, Vibration,
  General.

## Success Criteria *(mandatory)*

- **SC-001**: While dragging a size or height slider, at least 90% of the controller area is
  visible (not covered by opaque menu parts).
- **SC-002**: A player finds and changes any setting in at most 2 taps after opening the menu
  (plus the drag for sliders), on a phone held sideways.
- **SC-003**: Every setting keeps its value after reloading the page (same as today).
- **SC-004**: The maintainer judges the menu consistent with the host UI prototype on a phone
  and a tablet.
- **SC-005**: Opening, using and closing the menu produces no errors in the browser console.

## Assumptions

- The host UI prototype (`drafts/host-ui`) is the style reference; on the phone the menu uses its
  dark look only (the controller page has no light theme).
- Sections may be shown as tabs, a side list or a scrolling page; the plan picks the layout that
  meets SC-002 on a phone held sideways.
- Transparency applies to touch and mouse drags; keyboard changes keep the menu visible because
  there is no "release" to bring it back.
- The settings model, its ranges and edit-layout mode stay as they are; only the menu changes.
- The language choice is a segmented control while there are three options; with more languages
  it becomes a dropdown in the host UI's field style.
- Stick zone previews are drawn on the thumb's travel (the hitbox minus the thumb), which is what
  the stick value is measured on; it matches the drawn base in the official skin.
