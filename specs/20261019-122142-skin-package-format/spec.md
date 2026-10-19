# Feature Specification: Skin Package Format v1

**Feature Branch**: `feat/20261019-122142-skin-package-format`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Skin package format v1 for Ninjoy: the data format that describes a
touch controller skin, which the controller page renders and the future Skin Studio will produce."

## Overview

A **skin** defines what a Ninjoy touch controller looks like and which DualShock 4 input each
on-screen element sends. Players load skins on their phones; artists create them. This feature
defines the skin package: what it contains, what it can express, and how it is validated. It
does not define how touches are processed (separate touch engine spec) nor the Skin Studio UI.

The format mirrors how the future Skin Studio works: the artist imports **each control as a
separate SVG**, assigns a **role** to every element of that SVG, chooses colors and an anchor,
and places the control on a **fixed 1600 × 720 canvas**. Until the Studio exists, skins are
written by hand (manifest plus SVG files).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play with the official Ninjoy skin (Priority: P1)

A player opens the controller on their phone and sees the official "Ninjoy" skin: every button,
stick, trigger, touchpad area and system control appears exactly as the artist drew it and sends
the DS4 input it represents.

**Why this priority**: Without a skin there is no controller. The official skin is also the
reference that proves the format can express a complete DS4.

**Independent Test**: Load the official skin package; confirm every control of the original
drawing is present at its drawn position and size, with the correct input binding.

**Acceptance Scenarios**:

1. **Given** the official Ninjoy skin package, **When** it is loaded on a 20:9 screen at 100%
   size, **Then** every control appears at the same position and size as in the artist's
   1600 × 720 drawing.
2. **Given** the official skin, **When** it is validated, **Then** it produces no errors and no
   warnings.
3. **Given** the official skin, **When** its controls are listed, **Then** they cover all DS4
   inputs: 4 face buttons, 4 d-pad directions, L1/R1 (on both sides), analog L2/R2 (on both
   sides), both sticks with L3/R3, Share, Options, PS, both touchpad halves with their left and
   right clicks, plus the menu, fullscreen and gyro system controls.

---

### User Story 2 - Artist creates a skin by hand (Priority: P1)

An artist draws each control as its own SVG, writes a manifest that places the controls on the
1600 × 720 canvas, says which DS4 input each one sends and which element of each SVG is the
background, icon, thumb or hitbox, and loads the result.

**Why this priority**: Community skins are a core goal. Before the Studio exists, hand-written
packages are the only way to create them, and the Studio will output the same format.

**Independent Test**: Build a minimal package (one button and one stick) from scratch following
only the format documentation, load it, and confirm both controls render and are bound
correctly.

**Acceptance Scenarios**:

1. **Given** a package with a button control whose SVG has one element marked as base and one
   as label, **When** it is loaded, **Then** the button renders at its declared position and
   size and is bound to its declared DS4 input.
2. **Given** a button with several bindings (for example up and left), **When** it is loaded,
   **Then** it is recognized as a single control that sends all of its bindings together.
3. **Given** a stick control whose SVG marks a base, a thumb and a hitbox, **When** it is loaded,
   **Then** the thumb's allowed travel is the ellipse inscribed in the hitbox's bounding box,
   with width and height treated independently.
4. **Given** an analog trigger declared with direction "right", **When** it is loaded,
   **Then** its force is defined as growing from its left edge to its right edge.

---

### User Story 3 - Clear feedback on broken skins (Priority: P2)

An artist loads a skin that has mistakes and receives a human-readable report explaining what is
wrong and how to fix it, instead of a broken controller.

**Why this priority**: Most skin authors will not be programmers; good feedback decides whether
community skins succeed.

**Independent Test**: Load packages with known mistakes and confirm each produces the expected
error or warning message.

**Acceptance Scenarios**:

1. **Given** a control bound to an unknown input such as "crss", **When** the skin is validated,
   **Then** the skin is rejected and the report names the control, the field and the invalid
   value.
2. **Given** a stick without a thumb, **When** the skin is validated, **Then** the skin is
   rejected with an error naming the stick and the missing thumb.
3. **Given** a manifest that references an SVG file not present in the package, **When** the
   skin is validated, **Then** the skin is rejected with an error naming the missing file.
4. **Given** a valid skin with an optional item missing (for example no preview image),
   **When** it is validated, **Then** it loads and the report contains an informational note.
5. **Given** a skin with no menu control, **When** it is validated, **Then** it loads and the
   report contains a warning that the skin has no menu button.

---

### User Story 4 - Skins cannot harm players (Priority: P1)

A player installs a skin made by a stranger. Whatever the skin contains, it cannot run code,
contact the internet or read anything from the player's device.

**Why this priority**: Required by the constitution (Principle IV). Skins will be shared publicly
(Workshop) and a skin file can be edited by hand outside the Studio, so this is a safety
requirement, not a nice-to-have.

**Independent Test**: Load packages whose SVGs contain, one at a time, a script, an event handler
attribute, embedded foreign content and a link to an external resource; confirm each package is
rejected and nothing is executed or fetched.

**Acceptance Scenarios**:

1. **Given** an SVG containing a script element, **When** the skin is loaded, **Then** the skin
   is rejected, the script is never executed, and the report names the file and the element.
2. **Given** an SVG element with an event handler attribute, **When** the skin is loaded,
   **Then** the skin is rejected and the report names the file and the attribute.
3. **Given** an SVG referencing an image or style on another server, **When** the skin is
   loaded, **Then** the skin is rejected and no network request is made.
4. **Given** an SVG referencing an image file inside the same package, **When** the skin is
   loaded, **Then** the image is displayed.

---

### User Story 5 - Skin adapts to other screens (Priority: P2)

A player uses the skin on a 4:3 tablet or on a wider phone, or shrinks the controller. Groups
of controls move toward the side the artist chose, keeping their internal arrangement.

**Why this priority**: Phones and tablets have many shapes; the artist must control where each
part of the layout goes, but this only needs the skin to *declare* anchors (the movement itself
belongs to the touch engine spec).

**Independent Test**: Load a skin with groups anchored left, center and right and confirm each
group's anchor is read correctly, and that a control outside any group receives the anchor
implied by its position.

**Acceptance Scenarios**:

1. **Given** a group declared with anchor "right", **When** the skin is loaded, **Then** every
   control in the group reports anchor "right".
2. **Given** a control that belongs to no group and declares no anchor, placed in the left third
   of the canvas, **When** the skin is loaded, **Then** its anchor is "left".
3. **Given** a skin background with a color and a watermark image set to "center" at 30%
   opacity, **When** the skin is loaded, **Then** the background is a screen-filling layer
   behind the controls with that color, and the image is centered at 30% opacity without
   being distorted.

---

### User Story 6 - Colors chosen per element (Priority: P3)

An artist sets a normal and a pressed color for each element of a control (for example the
thumb different from the base), or lets elements inherit colors from the skin's defaults, which
in turn can inherit the colors already present in the SVG.

**Why this priority**: Makes skins easy to recolor (and later themeable by players), but a skin
works without it.

**Independent Test**: Load a skin where one control overrides its base color and another
inherits; confirm the resolved colors follow the inheritance rules.

**Acceptance Scenarios**:

1. **Given** skin defaults with a base color and a control that declares no colors, **When** the
   skin is loaded, **Then** the control's base resolves to the skin default.
2. **Given** a control that overrides its thumb pressed color, **When** the skin is loaded,
   **Then** only that color differs; all other colors follow the inheritance rules.
3. **Given** neither the control nor the skin declares a color for an element, **When** the skin
   is loaded, **Then** the element keeps the color drawn in its SVG.

---

### Edge Cases

- A control placed partially or completely outside the 1600 × 720 canvas: warning, control kept.
- Two controls overlapping: allowed (overlap is how one finger presses two buttons).
- The same DS4 input bound by several controls (for example L1 on both sides): allowed.
- A skin with no menu control: loads with a warning; no menu button is added automatically
  (publishing a skin without a menu is blocked by the Studio/Workshop features).
- A control SVG with elements that have no role: treated as decoration of that control.
- An element marked with two roles, or two elements marked as the same unique role (two thumbs):
  error naming the control.
- Toggle icons: `label-on`/`label-off` declared on a control that is not a toggle (fullscreen,
  gyro): warning, roles ignored.
- A `level` element on a control that is not a trigger: warning, ignored.
- A hitbox much larger than its base: allowed (artist choice), no warning.
- A manifest declaring a newer format version than the player's Ninjoy supports: rejected with a
  message asking the player to update Ninjoy.
- Unknown extra fields in the manifest: warning, ignored (forward compatibility).
- A package larger than the maximum size, or an SVG that cannot be parsed: rejected with an error.

## Requirements *(mandatory)*

### Functional Requirements

**Package and manifest**

- **FR-001**: A skin package MUST contain one manifest and the files it references; it MAY be
  distributed as a folder or as a single archive file containing that folder's contents.
- **FR-002**: The manifest MUST declare: skin name, author, skin version, format version and
  orientation. In format v1 the only valid orientation is landscape.
- **FR-003**: The manifest MAY declare: a preview image, a background, skin color defaults,
  tuning defaults, and groups.
- **FR-004**: Every file referenced by the manifest or by an SVG MUST be inside the package;
  references outside the package are invalid.

**Canvas and placement**

- **FR-005**: The reference canvas MUST be 1600 × 720 units for every skin.
- **FR-006**: Each control MUST declare its position and size on the canvas; its SVG artwork is
  fitted into that box preserving the artwork's aspect ratio.
- **FR-007**: A skin rendered at 100% size on a 20:9 screen MUST reproduce the declared
  positions and sizes exactly.

**Control types and bindings**

- **FR-008**: A control MUST have exactly one type: button, stick, trigger, touchpad, or system.
- **FR-009**: A button MUST be bound to one or more of: cross, circle, square, triangle, up,
  down, left, right, L1, R1, L2, R2, L3, R3, share, options, PS, touchpad click, touchpad click
  (left half), touchpad click (right half). A button bound to L2 or R2 sends full force.
- **FR-010**: A stick MUST declare its side (left or right). Its click (L3 or R3) is implied by
  the side.
- **FR-011**: A trigger MUST declare L2 or R2 and the direction in which force grows: up, down,
  left or right (default up).
- **FR-012**: A touchpad control MUST declare its area: full, left half or right half.
- **FR-013**: A system control MUST be one of: menu, fullscreen toggle, gyro toggle. System
  controls are not DS4 inputs.

**Element roles**

- **FR-014**: Each control MUST reference its own SVG and MAY assign roles to elements of that
  SVG: base, label, label-on, label-off, thumb, hitbox, pressed, level. Elements without a role
  are decoration.
- **FR-015**: A stick MUST have exactly one thumb. The thumb's allowed travel is the ellipse
  inscribed in the bounding box of the hitbox (or of the base when there is no hitbox), with
  width and height independent.
- **FR-016**: The touch area of a control MUST be exactly the shape of its hitbox if present,
  otherwise exactly the shape of its base, otherwise the whole control artwork; the format
  adds no margin.
- **FR-017**: Any control MAY provide two icons: label-on (shown while the control is active:
  pressed, or switched on for toggles such as fullscreen and gyro) and label-off (shown while
  inactive). A control with a single icon (label, or only one of the two) shows it in both
  states.
- **FR-018**: The role level applies only to triggers and marks an optional custom fill that is
  revealed according to the trigger's force (never stretched).
- **FR-019**: The role pressed marks an optional element shown only while the control is
  pressed.
- **FR-019a**: The skin MAY enable or disable a glow on pressed controls and choose its color,
  as a skin default overridable per control. The glow is on by default with Ninjoy's built-in
  color.
- **FR-019b**: For toggle controls (fullscreen, gyro), the skin MAY decide whether the "on"
  state uses the full active appearance (active colors and glow), as a skin default
  overridable per toggle. Default: yes. Toggle icons (label-on/label-off) follow the on/off
  state regardless of this setting.

**Groups and anchors**

- **FR-020**: The manifest MAY declare groups; each group has a name, an anchor (left, center or
  right) and a list of controls. A control belongs to at most one group.
- **FR-021**: A control outside any group behaves as a group of one and MAY declare its own
  anchor.
- **FR-022**: When no anchor is declared, the anchor MUST be derived from the horizontal center
  of the group (or control): left third of the canvas → left, right third → right, otherwise
  center.
- **FR-023**: The skin MAY declare a background: a screen-filling layer behind all controls,
  defined by a color and an optional image (SVG or raster from the package) with a placement
  (cover, contain, center or tile) and an opacity, so it can serve as a picture or a
  watermark. The background is not a control, never distorts its image, and is not affected by
  groups, anchors or the player's size settings.

**Colors**

- **FR-024**: For each individual element (path or shape) of a control's SVG, the skin MAY
  declare an inactive color and an active color. Each of the two colors of each element
  either has its own value or inherits, independently of the other color and of the other
  elements.
- **FR-025**: Color resolution MUST follow: element value → skin default for that element's
  role → color drawn in the SVG.
- **FR-025a**: A trigger MAY additionally declare (or inherit from skin defaults) the color of
  its force fill and the color of its 100% zone. By default the 100% zone uses the fill color;
  each can be set independently. When nothing is declared, Ninjoy's built-in color is used.
  (How the fill and the zone are shown while pressing is defined by the touch engine spec.)

**Tuning**

- **FR-026**: The manifest MAY declare tuning defaults: trigger 100% zone and trigger minimum
  force (the force of any touch on the trigger); stick dead zone and stick 100% zone; each as
  a fraction between 0 and 1, settable per control type and overridable per control. Triggers
  have no dead zone: lifting the finger is zero force. Missing values fall back to Ninjoy's
  built-in defaults: trigger 100% zone 0.25, trigger minimum force 0, stick dead zone 0.10,
  stick 100% zone 0.05.
- **FR-027**: Tuning values are the skin's defaults only; players can change them on their
  device (globally in the menu, or per trigger/stick with an "inherit" option) and those
  changes are never written into the skin.

**Validation and safety**

- **FR-028**: Loading a skin MUST produce a report with entries classified as error, warning or
  info, each naming the affected control or file in plain language.
- **FR-029**: A skin with any error MUST NOT be loaded; a skin with only warnings or info MUST
  load.
- **FR-030**: Invalid enumerated values (binding, type, side, direction, area, anchor, role)
  MUST produce an error naming the control, the field and the invalid value.
- **FR-031**: A skin whose files contain scripts, event handler attributes, embedded foreign
  content or references to resources outside the package MUST be rejected with an error naming
  the file and the offending element. (Cleaning imported artwork is the Studio's job.)
- **FR-031a**: A skin without a menu control MUST load with a warning; Ninjoy MUST NOT add a
  menu button automatically.
- **FR-032**: Loading a skin MUST NOT execute code from the skin and MUST NOT make network
  requests to anywhere other than the Ninjoy host serving the skin.
- **FR-033**: The package MUST NOT exceed 20 MB in total.

**Official skin**

- **FR-034**: The official "Ninjoy" skin MUST be provided in this format, reproducing the
  maintainer's current drawing (controls, positions, sizes, groups and anchors), and MUST be
  used as the reference fixture for validation tests. Once the Skin Studio exists, the official
  skin will be recreated in it and replace this converted version.
- **FR-035**: The format MUST be documented for skin authors in English, with a complete
  example, so a skin can be written by hand without reading source code.

### Key Entities

- **Skin package**: the distributable unit; contains the manifest, control SVGs, optional
  background, optional preview and optional local images.
- **Manifest**: metadata (name, author, version, format version, orientation), list of
  controls, groups, color defaults, tuning defaults, background and preview references.
- **Background**: color plus optional image with placement and opacity, filling the screen.
- **Control**: one interactive element; has a type, bindings or type-specific settings, a box
  on the canvas, an SVG, element roles, optional colors, optional tuning and optional anchor.
- **Element role**: the meaning of one element of a control's SVG (base, label, label-on,
  label-off, thumb, hitbox, pressed, level).
- **Group**: a named set of controls that share an anchor.
- **Validation report**: list of error / warning / info entries produced when loading or
  installing a skin.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The official Ninjoy skin loads with zero errors and zero warnings, and 100% of
  its controls appear within 1 canvas unit of the original drawing's positions and sizes.
- **SC-002**: A person who has never seen the format can write a working two-control skin
  (one button, one stick) from the documentation alone in under 30 minutes.
- **SC-003**: 100% of the unsafe-content test cases (scripts, event handlers, foreign content,
  external references) are rejected, with zero code executed and zero external requests made.
- **SC-004**: Every validation error message names the affected control or file and the field
  or value at fault.
- **SC-005**: A skin package produced by the future Skin Studio can be represented without
  any field outside this format (verified against the Studio requirements recorded so far).

## Assumptions

- Skin authors use any vector tool that exports SVG; the format does not depend on a specific
  tool, and assigning roles means identifying SVG elements (for example by element id).
- The archive form of a package is a standard zip file; its file extension will be chosen in
  the plan.
- The maximum package size of 20 MB is a reasonable default for vector skins with a few raster
  images; it can be revised.
- A player using a skin without a menu cannot open the Ninjoy menu from the phone; the host
  will be able to change that controller's skin (host spec).
- Player customizations (size, height, moved or resized groups, finger size, tuning overrides)
  are stored on the player's device per skin and are out of scope here.
- Importing a whole skin from a single layer-named SVG is out of scope; the official skin will
  be converted once into this format as part of this feature.
- Portrait orientation, the Skin Studio UI and Steam Workshop publishing are out of scope for
  format v1; the format version field allows these to be added later.
