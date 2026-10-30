# Feature Specification: Linux Setup Button and Port Choice

**Feature Branch**: `feat/20261021-194621-linux-setup-ports`

**Created**: 2026-10-21

**Status**: Draft

**Input**: A fresh Linux install cannot create virtual controllers or behave like Windows until the
system is configured:
- the virtual controller device is reserved to the administrator;
- the touchpad of Ninjoy's controllers moves the desktop pointer;
- the standard web ports need permission;
- an active firewall may block phones.

The app should find what is missing and fix all of it with one "Configure" button that asks for the
administrator password once. The app also gains a port setting (automatic or custom), and keeps
refusing a second copy of itself.

## Overview

The Linux path works today, but only after manual commands, as tested on CachyOS (KDE, Wayland).
Each of these has to be set up by hand:

| Missing piece | What the user sees |
|---|---|
| Permission to create virtual controllers | No controllers for games: the status shows "no virtual controllers" |
| The touchpad rule | Each Ninjoy controller's touchpad drives the desktop pointer, even while Steam Input uses it |
| Permission for the standard ports | Phones must type an address with a port (`ninjoy.local:8443`) |
| A firewall opening, when a firewall is on | Phones cannot reach the PC at all |

Steam's own device rules already let Steam read the controllers. Nothing about them changes.

This feature puts the fix in the app. Windows behaves as today: it has no setup items and no
Configure button. The port setting works on both systems.

## Clarifications

### Session 2026-10-30

- Q: Who gets the permission to create virtual controllers on Linux? → A: Whoever is logged in
  at the PC's local session; it follows the person at the machine and works at once, with no
  logout.
- Q: Should the firewall opening accept connections from the local network only or from
  anywhere? → A: Only from private local network ranges (192.168.x, 10.x, 172.16–31.x and the
  local IPv6 equivalents), for the app's ports and the local name announcement (mDNS).
- Q: Should the app offer a way to undo the Linux setup? → A: No; the README documents how to
  undo each item, and removal on uninstall is left to the future packages.
- Q: When the ports change (a custom port setting, or the setup allowing ports below 1024 in
  Automatic), do phones follow by themselves? → A: No. There is no mechanism for phones to
  follow: players scan their controller's QR code again.
- Q: What restarts when the ports change, and when? → A: Only the phone server, inside the app,
  right away (no "Restart now" button). The virtual controllers stay connected for games until
  each player comes back through the QR code. A short notice tells the user that connected
  phones will have to reconnect.
- Q: Besides app start and after a setup run, when does the app check the Linux items again?
  → A: Also each time the status panel is opened.
- Q: How is the use of ports below 1024 allowed on Linux? → A: System-wide: the lowest
  unprivileged port is lowered (persisted in the system settings), so it works at once, survives
  updates and works for any build. Any program on the PC may then use those ports; the
  per-program alternative was rejected because it needs a full app restart and a new password
  after every update.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Linux with one button (Priority: P1)

A Linux user installs Ninjoy and opens it. The status shows that the system is not set up and
lists what is missing, each item with a one-line explanation. The user presses "Configure" and
types the administrator password once. Every item is applied, the list turns green, and virtual
controllers appear without restarting the app.

**Why this priority**: Without it, Linux users have no virtual controllers at all unless they
follow terminal instructions.

**Independent Test**:
1. On a Linux PC where none of the pieces are set up, open the app and check the missing items
   are listed.
2. Press Configure and enter the password.
3. Check that every item becomes done.
4. Check that a phone's controller then appears to games.
5. Check that its touchpad does not move the pointer.
6. Reboot and check everything still works with no new prompt.

**Acceptance Scenarios**:

1. **Given** a Linux PC with nothing set up, **When** the app starts, **Then** the status chip
   warns, and its panel lists each missing item with a short explanation and a single
   "Configure" button.
2. **Given** the list of missing items, **When** the user presses Configure, **Then** the system
   asks for the administrator password once, and all missing items are applied in that one step.
3. **Given** the setup finished, **Then** each item shows done, or failed with the reason. The
   app checks the system again by itself.
4. **Given** controller permission was just granted, **Then** virtual controllers are created
   for the controllers in use and for new ones, without restarting the app or reconnecting
   phones.
5. **Given** the setup is done, **When** the PC restarts, **Then** everything keeps working, and
   the app shows nothing missing.
6. **Given** the user cancels the password prompt, **Then** nothing changes, and the app says the
   setup was cancelled.
7. **Given** everything is already set up, **Then** the status panel shows no Configure button,
   only that the system is ready.

---

### User Story 2 - The touchpad stays inside the game (Priority: P1)

With setup done, a player uses a Ninjoy controller's touchpad in a game through Steam Input. The
touchpad works in the game, and the desktop pointer does not move.

**Why this priority**: Without it, every touch on the phone's touchpad also moves the PC's mouse
pointer. That breaks games and the desktop, while on Windows this never happens.

**Independent Test**: After setup, join from a phone, slide on the touchpad and check the desktop
pointer stays still. Then check a game with Steam Input still receives the touchpad.

**Acceptance Scenarios**:

1. **Given** the touchpad item is set up, **When** a Ninjoy controller appears, **Then** the
   desktop does not treat its touchpad as a pointing device. Steam Input still reads it.
2. **Given** a real DualShock 4 or DualSense is plugged into the same PC, **Then** its touchpad
   behaves as before: the setup only affects Ninjoy's controllers.

---

### User Story 3 - Choose the ports (Priority: P2)

A user whose PC already uses the standard ports for something else, or who wants fixed ports for
their network, opens the app's settings. They switch Ports from Automatic to Custom and type the
secure port and the plain port. The app applies them at once: the phone server moves to the new
ports, the addresses and QR codes update, and a short notice says connected phones have to
reconnect. Players scan their controller's QR code again; games never see the controllers
unplugged.

**Why this priority**: Automatic covers most homes. Custom solves clashes with other servers and
fixed firewall rules.

**Independent Test**: With a phone playing, set custom ports, check the notice shows, the
addresses and QR codes use the new ports, the game still sees the controller, and the phone gets
it back by scanning its QR code. Set a port that is taken, and check the app explains the clash
and keeps working.

**Acceptance Scenarios**:

1. **Given** Ports is Automatic (the default), **Then** the app behaves as today: the standard
   secure and plain ports, with the alternate ports when those are taken or not allowed.
2. **Given** the user picks Custom with two valid ports, **When** they save, **Then** the phone
   server restarts on those ports right away, the addresses and QR codes change, and a short
   notice says connected phones have to reconnect. Games keep seeing the virtual controllers
   connected. Phones do not follow by themselves: each player scans their controller's QR code
   again and gets that controller number back.
3. **Given** the setup has just allowed ports below 1024 while Ports is Automatic, **Then** the
   phone server moves to the standard ports right away, with the same notice.
4. **Given** an invalid entry, **Then** the setting refuses it and says why, and the running
   session is untouched. Invalid means: not a number, outside 1–65535, or the same port for both.
5. **Given** a custom port that another program uses, **Then** the app
   shows which port is taken and goes back to the last working ports.
6. **Given** Linux with custom ports, **Then** the setup items cover those ports: the port
   permission when one is below 1024, and the firewall openings.

---

### User Story 4 - One Ninjoy at a time (Priority: P3)

A user opens Ninjoy while it is already running, for example from the menu while it sits in the
tray. The running copy shows its window. No second copy starts to fight over the ports and
controllers.

**Why this priority**: The app already does this. This story makes sure it holds on Linux and
stays covered by tests.

**Independent Test**: Start the app, then start it again (Linux and Windows), and check the
first window comes forward and only one copy runs.

**Acceptance Scenarios**:

1. **Given** Ninjoy is running, **When** it is started again, **Then** the running copy shows its
   window, and the new start exits.
2. **Given** the running copy crashed or was killed, **When** Ninjoy starts, **Then** it starts
   normally: a stale leftover never blocks it.

---

### Edge Cases

- **The setup partly fails** (for example, the firewall tool refuses): the items that worked stay
  done. The failed one shows the reason and how to do it by hand. Configure stays available for
  what is left.
- **No graphical password prompt is available**: the app shows the commands to run in a
  terminal, so the user is never stuck.
- **Phones after a port change**: the page now lives at a new address, so the browser treats it
  as a new site: the player's own settings on that phone (size, positions, chosen skin) start
  from the defaults, and the certificate warning may show again. To still give each player their
  number back, the controllers that had a phone are held open to any phone for the hold time.
- **A firewall the app does not know**, or none at all: no firewall item is shown. The panel's
  help mentions checking the firewall if phones cannot connect.
- **The virtual controller module is not available in the kernel**: the item fails with that
  reason. Phones still play, but games do not see the controllers.
- **The user removes a rule by hand later**: the next check (at the latest when the status
  panel is opened) lists the item again. Exception: ufw's rules can only be read by the
  administrator, so for ufw the app trusts its own record of what it applied.
- **Custom ports set while another copy of a server holds them at start**: same as a taken port,
  with the previous ports kept.

## Requirements *(mandatory)*

### Functional Requirements

#### Detecting and showing what is missing

- **FR-001**: On Linux, the app MUST check four setup items at start, after each setup run and
  each time the status panel is opened,
  and report each one as done or missing:
  1. **Controller permission:** the user logged in at the PC's local session can create virtual
     controllers, now and after a restart. It takes effect at once, with no logout, and is not
     given to other users or remote sessions.
  2. **Touchpad rule:** Ninjoy's controllers' touchpads are ignored by the desktop pointer.
  3. **Port permission:** programs may use ports below 1024 (a system-wide setting, down to the
     lowest port Ninjoy needs). This item is shown only when the automatic or custom ports need
     it.
  4. **Firewall opening:** the app's ports and the local name announcement (mDNS) are open to
     private local network ranges only (192.168.x, 10.x, 172.16–31.x and the local IPv6
     equivalents, plus the other ranges the host already accepts as local: 100.64–127.x and
     169.254.x); other origins stay blocked. This item is shown only when a known firewall is
     active.
- **FR-002**: The missing items MUST be shown in the existing virtual-controller status panel.
  Each item has a one-line explanation of what it changes and why. The status chip warns while
  the controller permission is missing.

#### Applying the setup

- **FR-003**: The panel MUST offer a single Configure button while any item is missing. It
  applies all missing items in one step, with one administrator password prompt. Nothing on the
  system changes without this button.
- **FR-004**: After a setup run, the app MUST show each item's result: done, or failed with the
  reason and the manual way to do it.
- **FR-005**: When the controller permission becomes available, the app MUST start creating
  virtual controllers without a restart: one for each controller in use and for every new one.
- **FR-006**: The setup MUST persist across reboots and MUST only affect Ninjoy's own controllers
  and ports. Real controllers and other programs MUST keep their behavior. The one system-wide
  change is the port permission, which lets any program use the low ports but changes nothing a
  program already does.
- **FR-007**: When the password prompt cannot be shown or is cancelled, the app MUST say so and
  MUST offer the equivalent terminal commands.

#### Ports

- **FR-008**: The settings MUST have a Ports option: Automatic (default, today's behavior) or
  Custom, with the secure port and the plain port.
- **FR-009**: Custom ports MUST be validated: whole numbers from 1 to 65535, and different from
  each other. Invalid input is refused with the reason.
- **FR-010**: A port change MUST restart only the phone server, inside the app, right away. This
  applies to saving new ports and to the setup allowing ports below 1024 in Automatic mode. The
  virtual controllers MUST stay connected for games, so games never see them unplugged.
  Addresses and QR codes MUST update, and the app MUST show a short notice that connected phones
  have to reconnect. Phones are not moved by themselves: scanning a controller's QR code joins
  that controller number again. Controllers that had a phone MUST be held open to any phone for
  the hold time, because the browser gives the page a new identity at the new address.
- **FR-011**: When a chosen port cannot be used, the app MUST name the port and the reason, and
  MUST return to the ports that worked before.
- **FR-012**: On Linux, the port permission and firewall items MUST follow the ports in use,
  automatic or custom.

#### Single copy

- **FR-013**: Starting the app while it runs MUST bring the running window forward and exit. A
  crashed earlier copy MUST NOT block a new start. This MUST hold on Windows and Linux.

### Key Entities

- **Setup item**: one system change the app needs on Linux. Each item has:
  - its id: controller permission, touchpad rule, port permission or firewall opening;
  - its state: done, missing or failed;
  - an explanation;
  - the reason, when it failed;
  - the manual commands.
- **Port setting**: the mode, Automatic or Custom. In Custom mode, it also holds the secure port
  and the plain port. It is saved with the app's other settings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a Linux PC with nothing set up, a user gets working virtual controllers in under
  1 minute from opening the app. This takes one button and one password, with no terminal.
- **SC-002**: After setup and a reboot, 100% of the items stay done, and the app asks for nothing.
- **SC-003**: With setup done, sliding on a Ninjoy controller's touchpad moves the desktop pointer
  0 times. Steam Input still reports the touchpad.
- **SC-004**: After changing to custom ports, a phone plays again on the same controller number
  by scanning that controller's QR code once, and the game never sees that controller unplugged.
- **SC-005**: Starting the app a second time never leaves two copies running (checked 10 times
  on each system).

## Assumptions

- **Supported desktops:** Linux desktops with the standard device manager (udev) and a graphical
  administrator prompt (polkit). This covers the major distributions: Arch-based such as
  CachyOS, Ubuntu, Fedora and Debian.
- **Firewalls:** the known firewalls are ufw and firewalld. Others are left alone, and the panel's
  help mentions them.
- **Steam's device rules** already give access to the controllers' raw data, and are not
  touched. If Steam is missing, games that read controllers the standard way still work.
- **Recognizing Ninjoy's controllers:** they carry a recognizable identity that real hardware
  never uses. This is what limits the touchpad rule to them.
- **Packages later:** packages and installers (AUR, .deb, Flatpak) are a later feature. They will
  ship the same rules, and the button stays for builds run from source.
- **Undoing the setup:** the app has no undo. The README documents how to remove each item by
  hand; removal on uninstall comes with the packages. Leftover items only affect Ninjoy's
  controllers and the local network, so they are harmless.
- **Out of scope:** macOS, and changing the Windows firewall (Windows asks by itself the first
  time).
