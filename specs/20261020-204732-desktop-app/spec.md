# Feature Specification: Desktop App

**Feature Branch**: `feat/20261020-204732-desktop-app`

**Created**: 2026-10-20

**Status**: Implemented

**Input**: The Ninjoy desktop app for Windows and Linux, built on the LAN session and the virtual
DualShock 4 backend: the interface approved in the host UI prototype (controller list with
details, QR code, live input, latency, settings, skins tab, light/dark/automatic theme, own
title bar), a system tray presence, starting with the system, saved controllers recreated at
start, and a command line that controls the running app (automation such as a Stream Deck).

## Overview

Today the host runs as a developer tool in a terminal. This feature delivers the app players
use: one window to create controllers, show their QR codes, watch who is connected and how each
controller behaves, and adjust a few settings. The app keeps running in the system tray, can
start with the computer, remembers the controllers the player created, and accepts commands
from the terminal or automation tools while it runs.

The look follows the approved prototype (`drafts/host-ui`, local): a list of controllers on the
left and the selected controller's details on the right, the depth style (tonal layers and
layered shadows), the Ninjoy fonts and wordmark, a large ninja watermark, light, dark and
automatic themes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a controller and let a friend join (Priority: P1)

The player opens Ninjoy, clicks "Create controller", and a numbered controller appears with a
large QR code. A friend scans it with a phone and plays; the list shows the controller as
connected with its device and latency.

**Why this priority**: This is the app's reason to exist; everything else supports it.

**Independent Test**: Open the app, create a controller, scan the QR code with a phone, check the
controller turns connected in the list and the phone works as a controller in a game.

**Acceptance Scenarios**:

1. **Given** the app opens, **Then** it shows the controller list (empty state with a hint when
   there are none), the network address (name and IP) and the virtual controller driver's state
   in the title bar.
2. **Given** the player clicks "Create controller", **Then** the next free number appears in the
   list, selected, with a QR code and the address to type (`ninjoy.local/N` and the IP form).
3. **Given** a phone opens that address, **Then** within 2 seconds the controller shows as
   connected with the device (for example "Galaxy S23 · Chrome"), its color stripe and its
   latency, and a virtual DualShock 4 is plugged for it.
4. **Given** a phone drops, **Then** the controller shows "Reconnecting…" with the remaining hold
   time; when the time runs out it shows as waiting again (the number stays while the player
   keeps it).
5. **Given** the player kicks a connected controller, **Then** the phone shows that it was
   disconnected by the host; **Given** the player removes a controller, **Then** it leaves the
   list and its virtual controller is unplugged.
6. **Given** a phone opens the bare address and phones may create controllers (setting), **Then**
   the new controller appears in the list like one created in the app.

---

### User Story 2 - See what each controller is doing (Priority: P1)

Selecting a controller shows its details: number, device, connected time, lightbar color, a live
drawing of the pressed buttons, sticks, triggers and touches, a phone shape that turns with the
phone's motion, and the latency now, on average and at its peak with a short history graph.

**Why this priority**: The host needs to know at a glance that every friend's controller works,
and to diagnose the one that does not.

**Independent Test**: Select a connected controller and press buttons, move sticks and turn the
phone; check the drawing follows within a frame and the latency numbers update.

**Acceptance Scenarios**:

1. **Given** a connected controller is selected, **Then** the live view shows every button,
   both sticks, both triggers and up to two touches as the phone sends them, updated at the
   screen's refresh rate.
2. **Given** gyro is on for that phone, **Then** the motion view turns a phone shape with the
   phone; **Given** gyro is off, **Then** it says so.
3. **Given** the controller is connected, **Then** latency now, average and peak are shown with a
   graph of the last 60 seconds.
4. **Given** the game sets rumble or the lightbar, **Then** the details show the lightbar color
   and that the phone vibrates (or that game vibration is off on that phone).

---

### User Story 3 - Ninjoy is just there (Priority: P2)

Closing the window keeps Ninjoy in the system tray; it can start with the computer (in the tray)
and recreates the controllers the player had, so friends can join without anyone opening it.

**Why this priority**: A party should not depend on someone remembering to open and set up the
app.

**Independent Test**: Create controllers 1–3, enable "Start with the computer", restart the
computer, and join controller 2 from a phone without touching the PC.

**Acceptance Scenarios**:

1. **Given** the player closes the window, **Then** Ninjoy keeps running in the tray (the first
   time it says so once); the tray menu opens the window or quits.
2. **Given** "Start with the computer" is on, **Then** Ninjoy starts in the tray when the user
   logs in, without opening the window.
3. **Given** the player created controllers, **Then** Ninjoy remembers their numbers and
   recreates them as waiting controllers at the next start; removed ones are forgotten.
4. **Given** Ninjoy is already running, **When** it is opened again, **Then** the running window
   comes to the front (no second copy).
5. **Given** Ninjoy starts, **Then** a short splash shows the logo while it loads (as on the
   phone), without delaying the window more than 1.5 seconds.

---

### User Story 4 - Control the running app from the command line (Priority: P2)

Automation tools and the terminal can create, remove, kick and list controllers in the running
app with the same program: `ninjoy create [n]`, `ninjoy remove <n>`, `ninjoy kick <n>`,
`ninjoy list`.

**Why this priority**: The maintainer wants buttons on a Stream Deck (or scripts) to manage
controllers without opening the window.

**Independent Test**: With Ninjoy running, run `ninjoy create 4` in a terminal and see controller
4 appear in the window; run `ninjoy list` and read the controllers.

**Acceptance Scenarios**:

1. **Given** Ninjoy runs, **When** `ninjoy create` or `ninjoy create 4` runs, **Then** the
   controller is created in the running app and the command prints its number and address.
2. **Given** `ninjoy remove 4` or `ninjoy kick 4`, **Then** the running app does it and the
   command prints the result; errors (no such controller, number taken) print a clear message
   and exit with a non-zero code.
3. **Given** `ninjoy list`, **Then** one line per controller: number, state, device, latency.
4. **Given** Ninjoy is not running, **Then** the command says so and exits with a non-zero code
   (it does not start a hidden copy).
5. **Given** another user on the same computer, **Then** they cannot control this user's Ninjoy.

---

### User Story 5 - Settings (Priority: P2)

A settings panel holds the few choices the host needs: theme (automatic, dark, light), language
(automatic, English, Portuguese), how long a dropped controller is held, whether phones may
create controllers, start with the computer, and the network address in use.

**Why this priority**: Defaults work for most; these cover the rest without a separate screen.

**Independent Test**: Change each setting, restart the app and check it was kept and applied.

**Acceptance Scenarios**:

1. **Given** theme "automatic", **Then** the app follows the system's light/dark choice live;
   dark and light force it.
2. **Given** a language choice, **Then** every text switches at once; "automatic" follows the
   system with English as fallback.
3. **Given** a hold time (10–300 seconds), **Then** dropped controllers are held that long.
4. **Given** "phones may create controllers" is off, **Then** the phone's controller list offers
   only existing controllers.
5. **Given** any change, **Then** it is saved at once and kept across restarts.

---

### User Story 6 - Skins tab and driver guidance (Priority: P3)

A "Skins" tab shows the installed skins (the official Ninjoy skin, with "Ninjoy Arcade" marked as
coming soon); the driver chip in the title bar explains what to install when virtual controllers
are unavailable.

**Why this priority**: The tab sets up where community skins will live; the driver guidance
removes the most common first-run problem.

**Independent Test**: Open the Skins tab and see the official skin; on a PC without the driver,
click the driver chip and read the guidance.

**Acceptance Scenarios**:

1. **Given** the Skins tab, **Then** it lists the installed skins with preview, name, author and
   version; importing a skin file is shown as coming soon.
2. **Given** virtual controllers are unavailable, **Then** the title bar chip says so in warning
   colors and opens the reason and fix (driver download on Windows, access rules on Linux);
   phones can still join.

### Edge Cases

- No network address (PC offline): the window says so and how to connect; controllers can still
  be created.
- The ports are taken (another Ninjoy or another program): the app uses the fallback ports and
  shows the address it got; if none works, it says which program to close.
- A saved controller number is taken by a phone's controller at start: the saved one is skipped
  with a note in the list.
- Many controllers (20+): the list scrolls; the details stay responsive.
- The window is resized small: list and details stack or the list narrows; nothing overlaps.
- The command line runs while the window is closed (tray only): it works the same.
- High-DPI and 100% scaling both render crisply.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST run the LAN session and the virtual controller backend in its own
  process (one process: window plus tray), on Windows and Linux.
- **FR-002**: The window MUST show the controller list (number, color stripe, name/device,
  state, latency) and the selected controller's details as in the approved prototype, with its
  own title bar (network chip, driver chip, settings, window buttons).
- **FR-003**: The player MUST be able to create (next free number or a chosen number), kick and
  remove controllers; each controller shows its QR code and both addresses.
- **FR-004**: The details MUST show live inputs, motion, lightbar, vibration state and latency
  (now, average, peak, 60-second graph) for the selected controller, updated at the screen rate.
- **FR-005**: Closing the window MUST keep the app in the tray; the tray menu MUST open the window
  and quit; a second launch MUST bring the running window forward.
- **FR-006**: The app MUST offer starting with the computer (in the tray) and remember created
  controllers, recreating them as waiting controllers at start.
- **FR-007**: The same program MUST accept `create [n]`, `remove <n>`, `kick <n>` and `list`
  commands that act on the running app through a channel only the same user can use, printing
  results and returning non-zero on errors.
- **FR-008**: Settings (theme, language, hold time, phones may create, start with the computer)
  MUST apply at once and persist; the network address in use MUST be shown.
- **FR-009**: The Skins tab MUST list installed skins (official skin) with preview, name, author
  and version; import is marked as coming soon.
- **FR-010**: When virtual controllers are unavailable the app MUST say so and show the fix,
  and keep serving phones.
- **FR-011**: All texts MUST come from en/pt catalogs (automatic language with English
  fallback); logs in English.
- **FR-012**: The app MUST show a splash at start of at most 1.5 seconds.

### Key Entities

- **Saved controller**: a controller number the player created; recreated at start.
- **App settings**: theme, language, hold time, phones may create, start with the computer.
- **Controller view**: number, state, device, connected since, color, last state, latency
  history, virtual pad status.

## Success Criteria *(mandatory)*

- **SC-001**: From opening the app, a player creates a controller and a friend joins it by QR
  code in under 30 seconds.
- **SC-002**: The live view reflects a phone input within one screen refresh after the host
  receives it.
- **SC-003**: With "start with the computer" on, a phone can join a saved controller within 30
  seconds of the user logging in, without touching the PC.
- **SC-004**: Command line actions take effect in the running app within 1 second.
- **SC-005**: With 8 connected controllers the window stays responsive (interactions under
  100 ms) and the app's own CPU use stays under 5% of one core while idle in the tray.
- **SC-006**: The maintainer judges the window consistent with the approved prototype in light
  and dark themes on Windows and Linux.

## Assumptions

- Windows 10/11 and current desktop Linux distributions (with a system web view available).
- The app embeds the controller page and the official skin like the developer host.
- Xbox 360 mode, importing and sanitizing community skins, choosing a skin per controller, the
  Steam Workshop, installers, code signing and updates are separate features; the saved
  controller keeps room for a mode and a skin later.
- The developer host stays for development and tests.
