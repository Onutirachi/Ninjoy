# Feature Specification: Virtual DualShock 4 Backend

**Feature Branch**: `feat/20261020-174310-virtual-ds4-backend`

**Created**: 2026-10-20

**Status**: Implemented

**Input**: Turn every controller slot of the LAN session into a virtual DualShock 4 that the
operating system, Steam and games see as a real controller, on Windows and Linux, building on the
validated prototype (findings in `docs/research/virtual-ds4-prototype.md`).

## Overview

The LAN session already receives each phone's controller state and can send feedback back to
the phone. This feature adds the device side: a virtual DualShock 4 per slot, fed with those
states and returning the game's rumble and lightbar to the phone. Each operating system gets its
own backend behind one boundary, so other devices or drivers can be added later without touching
the session or the page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Each phone is a DualShock 4 on Windows (Priority: P1)

A player joins from a phone and, on the Windows PC, a DualShock 4 appears that Steam and games
use like a real one: buttons, d-pad, sticks, analog triggers, touchpad (two fingers and click)
and motion.

**Why this priority**: This is what makes Ninjoy a controller; the prototype proved it on Windows.

**Independent Test**: With the host running on Windows, join from a phone and use Steam's
controller test screen to check every input; play a game.

**Acceptance Scenarios**:

1. **Given** the host runs on Windows with the virtual controller driver installed, **When** a
   phone joins slot N, **Then** a DualShock 4 appears in Windows and Steam within 2 seconds.
2. **Given** that controller, **Then** Steam's test screen shows every button, the d-pad, both
   sticks with their full range, both triggers as analog values, up to two touchpad fingers at
   their positions, the touchpad click on the side where the finger is, and gyroscope and
   accelerometer readings.
3. **Given** the phone held sideways and upright with the screen toward the player, **Then** it
   behaves like a DualShock 4 lying flat: turning it like a door turns the gyro yaw, tilting its
   top away pitches, turning it like a steering wheel rolls, and gravity reads "up".
4. **Given** nothing changes on the phone, **Then** the controller keeps reporting at a steady
   rate (like a real one), so held inputs never flicker or drop in Steam or games.
5. **Given** the phone drops (Wi-Fi blip, screen lock), **Then** the controller stays plugged
   with every input released during the grace period, and the same controller resumes when the
   phone comes back; **Given** the slot is freed, **Then** the controller is unplugged.
6. **Given** the host creates a waiting slot, **Then** its controller is plugged right away (with
   nothing pressed), so games can assign players before the phones join.

---

### User Story 2 - Each phone is a DualShock 4 on Linux (Priority: P1)

The same as User Story 1 on Linux, without installing any driver.

**Why this priority**: Linux is a supported platform; Steam Deck-like setups and Linux gaming PCs
are part of the audience.

**Independent Test**: On a Linux PC with the access rule in place, join from a phone and check
every input in Steam's test screen and with a joystick tester.

**Acceptance Scenarios**:

1. **Given** the host runs on Linux with access to the kernel's user-space HID device, **When** a
   phone joins, **Then** a DualShock 4 appears (with its motion sensors and touchpad as the kernel
   exposes them for a real one) within 2 seconds.
2. **Given** that controller, **Then** the inputs of User Story 1, scenarios 2 to 6, behave the
   same.

---

### User Story 3 - The game's rumble and lightbar reach the phone (Priority: P2)

When a game rumbles the controller or changes its lightbar color, the phone of that slot gets it.

**Why this priority**: Feedback completes the controller; the page already shows the lightbar
and vibrates (game rumble is experimental there).

**Independent Test**: Run a game or tool that sets rumble and lightbar on the controller and
check the phone receives them (the page's developer panel shows both).

**Acceptance Scenarios**:

1. **Given** a game sets the controller's rumble (two motors) or lightbar color, **Then** the
   slot's phone receives it within 50 ms.
2. **Given** the game stops the rumble, **Then** the phone receives the stop.
3. **Given** two phones, **Then** each receives only its own controller's feedback.

---

### User Story 4 - Clear guidance when the driver is missing (Priority: P2)

If the PC cannot create virtual controllers (Windows without the driver, Linux without access),
the host says so and how to fix it, and keeps serving the phones.

**Why this priority**: First runs on a new PC fail here; a clear message saves the player from
guessing.

**Independent Test**: Start the host on Windows without the driver (or Linux without access) and
read the message; join from a phone and check the page still works.

**Acceptance Scenarios**:

1. **Given** Windows without the virtual controller driver, **Then** the host reports that
   virtual controllers are unavailable, names the driver and where to get it, and keeps running.
2. **Given** Linux without access to the user-space HID device, **Then** the host reports it and
   shows the one access rule to add, and keeps running.
3. **Given** virtual controllers are unavailable, **Then** phones can still join and play their
   page; no virtual controller appears, and the host's slot list says why.
4. **Given** a controller fails to plug for another reason (driver error), **Then** the host
   reports it for that slot and keeps the other slots working.

---

### User Story 5 - The developer host runs the whole path (Priority: P3)

The headless developer host creates the virtual controllers, so the full path (phone → session →
device → game) runs from the project's own binary instead of the prototype.

**Why this priority**: Needed to test and develop until the desktop app exists.

**Independent Test**: Run the developer host, join from a phone, and use the controller in Steam.

**Acceptance Scenarios**:

1. **Given** the developer host runs, **Then** it plugs a controller per slot as in User Stories 1
   and 2 and prints when each controller is plugged, unplugged or fails.
2. **Given** a developer flag, **Then** the developer host can run without virtual controllers
   (session only), as today.
3. **Given** the developer host's commands, **Then** they can print the inputs sent and the
   feedback received per slot, to diagnose games.

### Edge Cases

- Many slots at once: every slot gets its own controller; the steady report rate holds for at
  least 8 controllers.
- The driver disappears or fails while running: the affected controllers are reported; the
  session keeps working; plugging is retried when a slot is used again.
- Gyro turned off on the phone: the controller reports a still, flat device (no motion).
- A slot is kicked: its controller releases every input at once and is unplugged when the slot is
  freed.
- Host shutdown: every controller is unplugged.
- A game opens the controller exclusively: Ninjoy keeps sending; behavior then depends on the game.
- Games that read the controller directly respond poorly (seen with Overwatch with Steam Input
  off): documented as a known limit; Steam Input on is recommended.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each controller slot MUST have its own virtual DualShock 4 while the slot exists:
  plugged when the slot is created or first used, kept through the grace period, unplugged when
  the slot is freed or the host stops.
- **FR-002**: The controller MUST report every input the session receives: buttons, d-pad, both
  sticks, both analog triggers, up to two touchpad touches with positions and the touchpad click,
  gyroscope and accelerometer in the DualShock 4's units, and a report timestamp.
- **FR-003**: Motion MUST map one to one from the page's screen frame to the DualShock 4 frame
  (a phone upright toward the player is a DualShock 4 lying flat); with gyro off the controller
  reports a still, flat device.
- **FR-004**: Each controller MUST report at a steady rate of 250 reports per second, with the
  report counter advancing like real hardware, whether or not inputs change.
- **FR-005**: From a state received by the host to the controller's report being submitted, the
  backend MUST add under 1 ms.
- **FR-006**: Rumble (two motors) and lightbar changes from the game MUST be sent to that slot's
  phone through the session's feedback.
- **FR-007**: Device creation MUST sit behind a backend boundary: the session, the developer host
  and later the desktop app depend only on that boundary; Windows and Linux each provide a
  backend, chosen at start.
- **FR-008**: When no backend can work (driver missing, no access), the host MUST report why and
  how to fix it, keep serving phones, and expose the reason with the slot list.
- **FR-009**: Failures plugging or updating one controller MUST be reported for that slot without
  affecting the others.
- **FR-010**: The developer host MUST run with the backend by default, offer a flag to run without
  it, print plug/unplug/failure events, and offer per-slot printing of inputs sent and feedback
  received.
- **FR-011**: Logs and messages MUST be in English (host); nothing new is shown on the phone.

### Key Entities

- **Virtual controller**: the device for one slot; plugged/unplugged; last reported state; report
  counter and timestamp; failure reason if any.
- **Device backend**: creates, updates and removes virtual controllers for one platform and
  reports their feedback; has an availability status with a reason.
- **Controller feedback**: rumble (two motors, 0–1) and lightbar color from the game, per slot.

## Success Criteria *(mandatory)*

- **SC-001**: On Windows and on Linux, every input listed in FR-002 shows correctly in Steam's
  controller test screen for a phone-driven controller.
- **SC-002**: The controller appears within 2 seconds of a phone joining (or the host creating a
  slot) and disappears within 2 seconds of the slot being freed.
- **SC-003**: With 8 controllers plugged, each keeps 250 ± 10 reports per second over 60 seconds.
- **SC-004**: The backend adds under 1 ms (95th percentile) between a state received and its
  report submitted.
- **SC-005**: A game's rumble and lightbar changes reach the right phone within 50 ms in 95% of
  cases, measured at the host.
- **SC-006**: On a PC without the driver (or without access on Linux), a first-time user can read
  the host's message and know what to install or change, and phones still load the page.

## Assumptions

- Windows uses the ViGEmBus driver (installed by the player or a later installer); Linux uses the
  kernel's user-space HID device, needing only an access rule, no driver install.
- The motion mapping, report rate and counter come from the prototype tests in Steam
  (`docs/research/virtual-ds4-prototype.md`).
- Game rumble reaching the phone unevenly was seen in the prototype (mostly Steam's short trigger
  pulses, rarely the game's own rumble); this feature delivers every rumble the driver reports
  and documents what it finds about Steam's rumble path; the page keeps game rumble experimental.
- Xbox 360 mode, DualSense, the desktop app, driver installers and macOS are separate features.
