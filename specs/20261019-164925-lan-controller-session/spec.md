# Feature Specification: LAN Controller Session v1

**Feature Branch**: `feat/20261019-164925-lan-controller-session`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "LAN controller session v1 for Ninjoy: connect the controller page
to the desktop host over the local network, so every phone/tablet becomes a numbered controller
slot on the PC. This feature delivers the host's network core (headless, no desktop UI and no
virtual device yet) and the page-side client."

## Overview

Players join a Ninjoy session by opening an address on their phone or tablet. The host — the
program running on the PC — serves the controller page, gives every device a numbered
**controller slot**, and receives each controller's state the moment it changes. It sends
feedback (rumble, lightbar color) back to the device.

This feature builds the **network core** of the host and the **session client** of the page.
The core runs without a window: a development program starts it and prints what happens, so the
whole path can be tested with real phones. Two later features plug into this core without
changing it:

- the **desktop app** (controller cards, QR codes, live input view, kick button);
- the **virtual device backend** (the DualShock 4 the games see, which also produces rumble and
  lightbar feedback).

**Trust model**: Ninjoy is for people in the same home. Anyone on the same local network can
open the page and take a free controller; there are no passwords or PINs by design. The host
never accepts connections from outside the local network and never talks to the internet.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Join as a controller and play (Priority: P1)

A player opens the address shown by the host on their phone, gets controller number 1 (or the
lowest free number), and every touch reaches the PC immediately.

**Why this priority**: This is the product: without it the controller page is a toy.

**Independent Test**: Start the development host, open the address on two phones, press
buttons and watch the host print each slot's state in real time.

**Acceptance Scenarios**:

1. **Given** the host is running and no one is connected, **When** a player opens the host's
   address without a number, **Then** the page loads, shows the controller, and the host
   reports slot 1 as connected.
2. **Given** slot 1 is in use, **When** a second player opens the address without a number,
   **Then** they get slot 2.
3. **Given** slots 1 and 3 are in use, **When** a player opens the address without a number,
   **Then** they get slot 2 (the lowest free number).
4. **Given** a connected player, **When** they press and release ✕, move a stick, pull a
   trigger, touch the touchpad or tilt the device with gyro on, **Then** the host receives the
   matching state for that slot, every change, in order.
5. **Given** a player opens the address of a specific free slot (e.g. `/4`), **Then** they get
   exactly that slot, even if lower numbers are free.
6. **Given** a connected player, **Then** the page shows their controller number when it
   connects and in the player menu.
7. **Given** slots 1 and 2 are in use, **When** the host creates a controller, **Then** slot 3
   appears as waiting for a device; **When** a player opens `/3` (e.g. by its QR code) or the
   address without a number, **Then** they take slot 3.
8. **Given** a waiting slot, **When** the host removes it, **Then** its number is free again.

---

### User Story 2 - Never stuck, always back (Priority: P1)

A player's phone locks, the Wi-Fi drops for a moment or the page reloads; their controller comes
back by itself as the same number, and while it is gone nothing stays pressed in the game.

**Why this priority**: A button stuck down or a lost controller number ruins a match.

**Independent Test**: Hold a button, turn off the phone's Wi-Fi for 10 s, turn it back on;
watch the host release everything at once and the slot come back as the same number.

**Acceptance Scenarios**:

1. **Given** a player holding buttons, **When** the connection is lost (no data for longer than
   the loss timeout) or the page is hidden, **Then** the host immediately reports a neutral
   state for that slot (nothing pressed, sticks centered, triggers at 0, no touches, no
   motion).
2. **Given** a player whose connection dropped, **When** the device comes back within the grace
   period (default 60 s), **Then** it reconnects automatically to the same slot without the
   player doing anything, and the slot was not given to anyone else meanwhile.
3. **Given** the grace period expired, **Then** the slot is freed and its number can be given to
   the next player; the returning device gets the lowest free number.
4. **Given** a state message is lost or arrives late, **When** the player does nothing else,
   **Then** the host still ends up with the correct state within the keepalive interval.
5. **Given** two messages arrive out of order, **Then** the host keeps the newer one and drops
   the older.
6. **Given** a player reloads the page, **Then** they get the same slot back.

---

### User Story 3 - Slot already in use and kicks (Priority: P2)

A player scans another player's QR code by mistake, or the host removes a player.

**Why this priority**: Prevents two phones fighting over one controller and lets the host keep
order, but the session works without it.

**Independent Test**: Open slot 1 on phone A, then open `/1` on phone B; then kick phone A from
the host.

**Acceptance Scenarios**:

1. **Given** slot 1 is held by device A, **When** device B opens `/1`, **Then** B sees a
   "controller in use" screen with a button to join as the lowest free number instead; A is not
   affected.
2. **Given** slot 1 is held by device A during its grace period, **When** device B opens `/1`,
   **Then** B sees the same "controller in use" screen.
3. **Given** the same device opens its own slot in a second tab, **Then** the newest tab takes
   the slot and the older tab shows that the controller was opened elsewhere.
4. **Given** the host kicks slot 2, **Then** the device sees "disconnected by the host" with a
   button to join again, it does not reconnect by itself, the host reports a neutral state and
   then frees the slot at once (no grace period).

---

### User Story 4 - Feedback from the game (Priority: P2)

When the game rumbles the controller, the phone vibrates; the lightbar color reaches the page.

**Why this priority**: Rumble adds feel and the lightbar identifies players, but games are
playable without them. The virtual device that produces them comes later; this story makes the
path exist and testable.

**Independent Test**: From the development host, send rumble and a lightbar color to a slot and
observe the phone and the development panel.

**Acceptance Scenarios**:

1. **Given** a connected Android phone, **When** the host sends rumble (strong and weak motor,
   0–1 each) above zero, **Then** the phone vibrates, more for stronger rumble, and stops within
   100 ms after the host sends zero.
2. **Given** a device without vibration (e.g. iPhone), **When** rumble arrives, **Then** nothing
   breaks and the player is told once that vibration is not available.
3. **Given** the host sends a lightbar color, **Then** the page receives it and the development
   panel shows it.
4. **Given** the page goes hidden or the connection drops, **Then** vibration stops.

---

### User Story 5 - Secure page for motion and fullscreen (Priority: P2)

Browsers allow motion sensors (gyro) and fullscreen only on secure pages. The host serves the
page securely with its own certificate and explains the one-time browser warning.

**Why this priority**: Gyro is a key DS4 feature (Steam Input aiming), but buttons, sticks and
triggers work without it.

**Independent Test**: Open the plain address on a phone, follow the explanation, accept the
warning once, and check that gyro works.

**Acceptance Scenarios**:

1. **Given** the host's first run, **Then** it creates its own certificate and reuses it on every
   later run, so devices that accepted it once are not warned again.
2. **Given** a player opens the plain (non-secure) address, **Then** they see a short page in
   their language explaining that the browser will show a warning once and how to continue, with
   a button to the secure address of the same slot.
3. **Given** the secure page, **When** the player turns gyro on, **Then** motion reaches the
   host.

---

### User Story 6 - Easy addresses (Priority: P3)

Players type a short, memorable address instead of an IP.

**Why this priority**: Comfort; QR codes and IP addresses already work.

**Independent Test**: On a phone on the same network, open `ninjoy.local/1`.

**Acceptance Scenarios**:

1. **Given** the host is running, **When** a device that supports local names opens
   `ninjoy.local/1`, **Then** it reaches slot 1.
2. **Given** a device or network where the local name does not work, **Then** the IP address
   works the same way, and the host prints both.
3. **Given** two Ninjoy hosts on the same network, **Then** the second one uses a different
   local name (e.g. `ninjoy-2.local`) and prints it.

---

### User Story 7 - Branded opening and notice screens (Priority: P3)

The page opens with a short Ninjoy splash, and every notice (connecting, in use, disconnected…)
uses one recognizable look: the Ninjoy logo with a message over a slowly moving background.

**Why this priority**: Identity and polish; the session works without it.

**Independent Test**: Open the page, watch the splash, then trigger each notice (kick, slot in
use, stop the host) and turn a phone upright.

**Acceptance Scenarios**:

1. **Given** the page opens, **Then** the logo fades in, zooms quickly to a very large size while
   fading out, and the controller appears; the whole splash lasts about 1.5 seconds and never
   delays a controller that is already connected.
2. **Given** the connection takes longer than the splash, **Then** the "connecting" notice shows
   until it is ready.
3. **Given** any notice, **Then** it shows the logo, a short pulsing message in the player's
   language, any action button (e.g. "join as controller 3") and the animated background.
4. **Given** a phone (shortest screen side under 600 CSS px) held upright, **Then** a notice asks
   to turn it sideways; **Given** a tablet held upright, **Then** no notice shows and the
   controller fits the width at the bottom of the screen.
5. **Given** the device has no internet, **Then** the splash, notices and fonts still look
   complete (everything they need is served by the host).

---

### Edge Cases

- Many players: 16 or more devices connected at once keep the same responsiveness.
- A device sends garbage or a message from a newer/older protocol version: the host rejects it
  without affecting other slots; the page shows "update needed" if the versions differ.
- The PC has several network adapters (Ethernet, Wi-Fi, virtual adapters): the host prints the
  addresses that phones can reach first and ignores virtual adapters where possible.
- The PC's firewall blocks the port: the host prints how to allow it (the most common cause of
  "page does not open").
- The default ports are taken by another program: the host uses alternative ports and prints the
  addresses with the port.
- The host stops: every page shows "host not available" and keeps retrying; when the host comes
  back, devices rejoin their numbers if the grace period allows (held slots are not persisted
  across host restarts).
- The page is hidden for a long time (screen off): the slot is held for the grace period, then
  freed.
- A slot number in the address that is not a positive whole number: the page treats it as the
  address without a number.
- The host sends feedback to a slot with no device connected: it is ignored.

## Requirements *(mandatory)*

### Functional Requirements

**Serving and addresses**

- **FR-001**: The host MUST serve the controller page and the official skin to devices on the
  same local network, with no install and no internet access.
- **FR-002**: The page of a slot MUST be reachable at `/<n>` on the host's local name
  (`ninjoy.local` by default) and on each of the host's reachable IP addresses; `/` gives the
  lowest free slot.
- **FR-003**: The host MUST announce its local name on the network; if the name is taken by
  another host it MUST pick a free variant and report it.
- **FR-004**: The host MUST serve the page securely using a certificate it generates on first
  run and keeps for later runs; the plain address MUST show a translated explanation of the
  one-time browser warning and a link to the secure address of the same slot, plus a
  secondary link that opens the same controller on the plain address without motion sensors
  (for browsers that refuse the certificate).
- **FR-005**: The host MUST accept connections only from local network addresses.

**Slots**

- **FR-006**: Slots are numbered from 1 with no low upper limit; a player without a number gets
  the lowest free number; a freed number is reused.
- **FR-006a**: The host MUST be able to create a slot ahead of time (the lowest free number,
  "waiting for a device") and remove a waiting slot. A waiting slot is taken by the first device
  that opens its address; a player without a number gets the lowest waiting slot first, else the
  lowest free number. A waiting slot stays until a device takes it or the host removes it.
- **FR-007**: A slot is in use while a device holds it or during that device's grace period; a
  device asking for a slot in use by another device MUST get a "controller in use" answer with
  the lowest free number to join instead.
- **FR-008**: Each page MUST keep a device identity (created on first visit, kept on the device)
  so the host recognizes the same device on reconnect; the newest connection from the same
  device for the same slot replaces the older one, which is told it was opened elsewhere.
- **FR-009**: After a connection loss the slot MUST be held for the grace period (default 60 s,
  configurable) and given back automatically to the same device; the page MUST retry by itself
  with increasing delays (up to a few seconds) while it is visible.
- **FR-010**: The host MUST be able to kick a slot: the device is told, does not reconnect by
  itself, and the slot is freed at once.

**Input path**

- **FR-011**: The page MUST send the full controller state (every field of the controller state
  produced by the touch engine) on every change, in the same frame as the change, plus a
  keepalive repetition of the current state at a fixed low rate (default 4 per second) when
  nothing changes.
- **FR-012**: Every state message MUST carry a sequence number; the host MUST drop messages older
  than the newest it accepted for that connection.
- **FR-013**: State messages MUST be compact binary messages with a protocol version; a version
  mismatch MUST be reported to the page, which tells the player an update is needed.
- **FR-014**: When no message arrives for longer than the loss timeout (default 1 s), when the
  page reports it is hidden, or when the connection closes, the host MUST hand a neutral state to
  the receiver for that slot at once.
- **FR-015**: The host MUST hand each accepted state to the receiver component together with the
  slot number, without waiting for other slots.

**Feedback path**

- **FR-016**: The host MUST be able to send a slot rumble (strong and weak motor, 0–1 each) and a
  lightbar color; the page MUST turn rumble into vibration where supported (stronger rumble →
  longer pulses within each short cycle), stop within 100 ms of a zero rumble, stop when hidden
  or disconnected, and expose the lightbar color to the page (shown in the development panel; a
  visual use in the skin may come later).
- **FR-017**: The host MUST tell the page its slot number on join; the page shows it briefly on
  connect and in the player menu.

**Status and measurement**

- **FR-018**: The page MUST show clear screens, in English or Portuguese like the rest of the
  page, for: connecting, controller in use, opened elsewhere, disconnected by the host, host not
  available (retrying), update needed, and turn the device sideways (phones only, see US7).
  Every notice and the certificate explanation page share one look: the Ninjoy logo, a short
  pulsing message, optional action buttons, over a slowly moving background pattern made of
  Ninjoy's own artwork (no third-party symbols or logos).
- **FR-018a**: The page MUST open with a splash of about 1.5 s (logo fades in, zooms quickly to a
  very large size and fades out, then the controller appears); it runs while connecting and is
  shown once per page load.
- **FR-018b**: Fonts and images used by the page MUST be served by the host (no internet), and
  every font MUST have a license that allows bundling it with Ninjoy.
- **FR-019**: The page and host MUST measure the round-trip time periodically; the development
  panel shows connection status, slot number, round-trip time and the last lightbar color.
- **FR-020**: The host core MUST offer later features: the list of slots (number, waiting,
  connected or held, device summary from the browser, connected since, last state, round-trip
  time), create and remove a waiting slot, kick, sending feedback, events (slot created,
  connected, reconnected, disconnected, freed, state received) and a pluggable receiver for
  states.
- **FR-021**: A development host program MUST start the core with defaults, print the addresses
  (local name and IPs, secure and plain), print slot events and, on request, the live states of a
  slot, and let the developer kick a slot and send test rumble and lightbar colors.
- **FR-022**: Configuration MUST include ports, grace period, loss timeout and local name, with
  defaults that need no editing; host logs are in English.

### Key Entities

- **Slot**: a controller number; state (free, connected, held during grace), the device holding
  it, connected-since time, last state, round-trip time.
- **Device identity**: an opaque value a page keeps on its device to be recognized on reconnect;
  not personal data.
- **State message**: protocol version, sequence number, the full controller state.
- **Feedback message**: rumble (strong, weak 0–1) and/or lightbar color for one slot.
- **Session event**: what happened to a slot and when (connected, reconnected, disconnected,
  freed, kicked).
- **Host certificate**: created on first run, kept between runs, used for the secure page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player on the same network goes from opening the address to a working controller
  in under 5 seconds (after the one-time certificate step).
- **SC-002**: The host hands each received state to the receiver in under 1 ms (95th percentile)
  with 16 controllers each sending 120 states per second.
- **SC-003**: On a typical home Wi-Fi network, the time from a touch on the phone to the state
  reaching the host's receiver is under 20 ms for 95% of states (measured through the round trip
  time; radio interference is outside Ninjoy's control).
- **SC-004**: After a connection loss, the host reports a neutral state within 1.2 seconds in 100%
  of trials; no button stays pressed.
- **SC-005**: A device that drops for up to 60 seconds gets the same controller number back
  automatically in 100% of trials, without the player touching anything.
- **SC-006**: Two devices never control the same slot at the same time.
- **SC-007**: 32 devices can be connected at once with numbers 1–32 and SC-002 still holds.
- **SC-008**: Rumble from the host is felt on an Android phone within 100 ms and stops within
  100 ms of a zero rumble.

## Assumptions

- Default ports: the secure page on 443 and the plain explanation page on 80, so addresses need
  no port (`ninjoy.local/1`); when a port cannot be used (taken by another program, or not
  allowed without privileges on Linux), the host falls back to 8443 / 8080 and prints the
  addresses with the port. The installer of the desktop app may grant the needed permission
  later.
- Local names (`.local`) work on iPhone, most desktop systems and recent Android versions; QR
  codes from the desktop app will use the IP address, which always works.
- Players accept the certificate warning once per device; the certificate lives as long as the
  installation.
- Held slots and device identities are not kept across host restarts.
- The keepalive rate (4 per second), loss timeout (1 s) and grace period (60 s) are defaults that
  can be tuned after real-world testing.
- The touch engine's controller state is the source of truth on the page; this feature does not
  change its behavior, only sends it.
- Skins are landscape-only in format v1; a portrait skin orientation (for tablets held upright)
  may be added to the skin format later. The 600 CSS px threshold for the "turn sideways" notice
  can be tuned after testing.
- The desktop app will reuse the same splash and notice look; it is specified with the desktop
  app.
- The logo and visual identity come from the maintainer's earlier Ninjoy prototype; the old
  fonts are replaced by an openly licensed font with a similar or better fit.
- Vibration intensity is approximated with on/off pulses, since browsers can only switch
  vibration on and off.
- Dependencies: the controller touch engine (implemented) and the skin package format
  (implemented).
