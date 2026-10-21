# Feature Specification: Skin Format v2 and Skin Library

**Feature Branch**: `feat/20261021-153515-skin-format-v2`

**Created**: 2026-10-21

**Status**: Draft

**Input**: What the Skin Studio and the maintainer's new skins need from the skin format, and how
skins reach the phones: colors that follow the game's lightbar or keep the drawn color,
decorative elements that ignore touch, controls that stay fixed when the player resizes the
layout, a stick that can act as an 8-way d-pad (for arcade skins), and a library of skins on the
host where the host picks the default and each player picks their own skin on the phone.

## Overview

Skins today follow format 1 and the controller page always shows the official skin. This
feature adds format 2 (format 1 skins keep working) and the skin library: skins installed on the
host, a default chosen in the desktop app, and a per-phone choice in the controller menu that
stays on that phone. The Skin Studio (a later feature) writes format 2 and installs into this
library.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player picks their skin on the phone (Priority: P1)

The host has several skins installed. A player opens the controller menu, picks one, and the
controller switches at once. Next time, on any controller number, the phone uses that skin.

**Why this priority**: It is how players get the skins made in the Studio and how the skin
system becomes visible.

**Independent Test**: Install two skins on the host, join from a phone, pick the second one in
the menu, leave, join another controller number, and check the second skin is shown.

**Acceptance Scenarios**:

1. **Given** the host has skins installed, **When** a player opens the controller menu, **Then** a
   Skin section lists them with name, author and preview, marking the host's default and the
   one in use.
2. **When** the player picks a skin, **Then** the controller switches to it without reloading the
   page or losing the connection, and the choice is saved on that phone.
3. **Given** a phone that picked a skin, **When** it joins any controller later (also after the
   controller was removed and created again), **Then** it uses its picked skin.
4. **Given** the picked skin is no longer installed on the host, **Then** the phone uses the
   host's default and says so once.
5. **Given** a player never picked a skin, **Then** the phone uses the host's default.
6. **Given** a player's layout edits and zone settings, **Then** they are kept per skin (switching
   skins does not mix them up).

---

### User Story 2 - The host chooses the default skin (Priority: P1)

In the desktop app's Skins tab the host sees the installed skins and chooses the default one.

**Why this priority**: The default is what every new phone sees.

**Independent Test**: Choose a different default in the Skins tab and join from a phone that
never picked a skin.

**Acceptance Scenarios**:

1. **Given** the Skins tab, **Then** it lists the installed skins (the official skin always first)
   with preview, name, author and version, and marks the default; the "Ninjoy Arcade (coming
   soon)" placeholder is gone.
2. **When** the host chooses a default, **Then** phones without their own choice switch to it at
   once and new phones get it.
3. **Given** a controller's details, **Then** they show which skin that phone is using.
4. **Given** a skin folder that fails validation, **Then** it is listed as broken with the reason
   and is not offered to phones.

---

### User Story 3 - Colors that follow the lightbar or keep the drawing (Priority: P2)

A skin element's colors can be the color drawn in its SVG, a fixed color, or the controller's
lightbar color (with an opacity), and the latter changes live when the game sets the lightbar.

**Why this priority**: The maintainer's new skin has a lightbar; it also lets skins show the
player's color like a console.

**Independent Test**: Use a skin whose bar uses the lightbar color, set the lightbar from a game
(or the developer host), and watch the bar change on the phone.

**Acceptance Scenarios**:

1. **Given** an element colored "lightbar", **When** the game sets the lightbar, **Then** that
   element takes the color within 100 ms; before any lightbar is set it uses the player's
   default color for that controller number.
2. **Given** "lightbar" with an opacity, **Then** the color is applied with that opacity.
3. **Given** an element set to "original", **Then** it keeps the color drawn in its SVG even when
   the skin's defaults give that role another color.
4. **Given** active and inactive colors, **Then** each can independently be original, a fixed
   color or the lightbar.

---

### User Story 4 - Decorations and fixed controls (Priority: P2)

A skin can contain decorations (a lightbar strip, a logo, lines) that never react to touch, and
any control or decoration can be fixed so it keeps its drawn place and size when the player
changes the layout size and height.

**Why this priority**: The new skin's PS button, lightbar and bottom buttons stay put while the
rest resizes.

**Independent Test**: Load a skin with a decoration and fixed controls, change size and height in
the menu, and check fixed items do not move while the rest does; touch the decoration and check
the control under it (if any) receives the touch.

**Acceptance Scenarios**:

1. **Given** a decoration, **Then** touches pass through it (a control drawn under it still gets
   them), it never shows a pressed state and it sends no input.
2. **Given** a fixed control or decoration, **When** the player changes size or height, **Then** it
   keeps the position and size it has on screen at the default layout; the other controls move
   and resize as today, and fixed items stay drawn above or below them as the skin orders them.
3. **Given** edit-layout mode, **Then** fixed controls can still be moved and resized there by the
   player (fixed only means they ignore the global size and height).

---

### User Story 5 - A stick that acts as a d-pad (Priority: P2)

A stick can send the d-pad (8 directions) instead of the analog stick, for arcade levers: the
skin sets the default for its sticks and each stick can inherit it or choose its own.

**Why this priority**: The planned arcade skin uses a lever; fighting games expect the d-pad.

**Independent Test**: Use a skin whose stick outputs the d-pad, move the thumb in 8 directions and
check the d-pad directions in Steam's test screen while the analog stick stays centered.

**Acceptance Scenarios**:

1. **Given** a stick set to d-pad, **When** the thumb leaves the dead zone, **Then** the d-pad sends
   the nearest of 8 directions (45° sectors), with a small hysteresis so it does not flicker on
   the borders; the analog stick stays centered.
2. **Given** the skin's default is d-pad and a stick does not say otherwise, **Then** it acts as a
   d-pad; a stick may override the default either way.
3. **Given** a d-pad stick and d-pad buttons pressed together, **Then** the d-pad reports the
   union, as when two fingers press two d-pad buttons today.

### Edge Cases

- A format 1 skin: loads as today (no lightbar colors, decorations or fixed controls).
- A format 2 skin on an older page: the host only offers skins the page supports.
- Two phones pick different skins: each sees its own; the host is unaffected.
- The default skin is removed: the official skin becomes the default.
- A skin is replaced by a newer version while a phone uses it: the phone switches to the new
  version on its next join (no surprise mid-game).
- A decoration covering a whole half of the screen: touches still reach controls under it.
- A fixed control overlapping a resized one at small sizes: both stay usable; the skin author
  sees the overlap in the Studio later.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The skin format MUST accept format 2 alongside format 1; format 2 adds the items in
  FR-002 to FR-005 and nothing in format 1 changes meaning.
- **FR-002**: An element color (inactive or active) MUST accept "original" (the drawn color), a
  fixed color, or "lightbar" with an optional opacity (0–1); "lightbar" follows the controller's
  lightbar live, starting from the default color for its number.
- **FR-003**: A control of type "decor" MUST draw like a control but take no touches, send no
  input and have no pressed state.
- **FR-004**: Any control or decoration MAY be "fixed": it keeps its default-layout screen
  position and size whatever the player's size and height settings; edit-layout mode can still
  move and resize it. A resizing group drawn right above a fixed group with the same anchor
  shrinks onto that group's top instead of the screen's bottom, so it never slides under it
  (SH and OP above a fixed PS).
- **FR-005**: A stick MUST be able to output the d-pad (8 directions, 45° sectors with hysteresis)
  instead of the analog stick; the skin's defaults set the output for its sticks and each stick
  MAY override it.
- **FR-006**: The host MUST keep a library of installed skins (the official skin always present),
  validate each with the skin format rules, offer only valid ones to phones, and remember the
  default skin.
- **FR-007**: The controller page MUST load its skin from the host's library, let the player pick
  one in the menu, save the choice on the phone, fall back to the default when missing, and
  switch skins without reloading or reconnecting.
- **FR-008**: Layout edits and zone overrides MUST be stored per skin on the phone.
- **FR-009**: The desktop app's Skins tab MUST list the library, choose the default and show broken
  skins with the reason; controller details MUST show each phone's skin; the Arcade placeholder
  MUST be removed.
- **FR-010**: Texts MUST be in the en/pt catalogs.

### Key Entities

- **Skin library**: the installed skins on the host (folders), each with its validation result;
  the default skin id.
- **Skin choice**: per phone, the id of the picked skin (or none = host default).
- **Format 2 manifest**: format 1 plus color values, "decor" controls, "fixed" and the stick
  output.

## Success Criteria *(mandatory)*

- **SC-001**: A player switches skins in under 5 seconds from opening the menu, without the
  controller disconnecting.
- **SC-002**: A phone's picked skin is used on 10 of 10 later joins, across controller numbers and
  host restarts.
- **SC-003**: A lightbar change reaches a "lightbar"-colored element within 100 ms of the host
  receiving it.
- **SC-004**: With a d-pad stick, Steam's test screen shows each of the 8 directions, and no
  flicker between neighbors when holding the thumb on a border.
- **SC-005**: Every official format 1 skin test keeps passing.

## Assumptions

- Installing skins from files (and sanitizing them) comes with the Studio and the community
  import features; this feature reads skins already placed in the library folder (the official
  one ships with the app; the maintainer can copy a folder there for tests).
- The canvas stays 1600 × 720 (20:9).
- The phone's layout edits are already per device; making them per skin only adds the skin id to
  their key.
- The app keeps its data (settings, certificate, skin library) in a `data` folder beside the
  program, so copying the program's folder backs everything up; when that folder cannot be
  written (installed for every user, a read-only image) it uses the user's data folder. The first
  run with the folder beside the program copies the user's data folder into it.
- Games send lightbar colors as LED intensities (often dim, like `64 0 0`); the phone and the host
  window show them with the brightest channel at full, keeping the hue, so they read on a screen
  as they look on a real controller.
