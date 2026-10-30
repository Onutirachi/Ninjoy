# Handoff: Linux Setup Button and Port Choice

**Updated**: 2026-10-30 | **Spec**: [spec.md](spec.md) | **Branch**: `feat/20261021-194621-linux-setup-ports`

## State

Spec clarified (committed and pushed as `fcf715f`). Plan written: [plan.md](plan.md),
[research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/),
[quickstart.md](quickstart.md). The plan and the spec changes made during planning are not
committed yet: they wait for the maintainer's review.

## Done in the last session

- `/speckit-clarify`: 6 questions (see the spec's Clarifications section).
- `/speckit-plan`. During planning:
  - the maintainer chose the system-wide port permission (sysctl);
  - the spec gained the "phones after a port change" edge case and the open hold in FR-010.

## Decisions

- One button for everything (pkexec, one password). The script it runs is also what the panel
  shows as manual commands.
- Controller permission: a udev `uaccess` rule (whoever is at the local session) plus `uhid` in
  modules-load.
- Firewall: ufw or firewalld, open only to the ranges `net::is_lan` accepts, for the ports and
  mDNS. ufw rules cannot be read without root, so `linux-setup.json` records them.
- Ports below 1024: `net.ipv4.ip_unprivileged_port_start` in `/etc/sysctl.d/99-ninjoy.conf`.
- A port change restarts only the phone servers, right away, with a notice. The slots and pads
  stay. Controllers that had a phone become an "open hold" for any phone, because a new port is
  a new origin (new device id, and the player's settings on the phone start fresh).
- No undo in the app; the README documents it.
- The checks run at start, after Configure and each time the status panel opens.

## Open questions

- None blocking. Ideas for later specs:
  - "Player profiles", next after this spec: named profiles on the phone, exported and imported
    as a file. Details in `drafts/HANDOFF.md`. When it lands, the port-change notice recommends
    exporting, and the page is told the host moved.
  - Steam Cloud sync for the Steam build (skins and preferences only).

## Next step

Maintainer reviews the plan → commit (the spec changes amend the spec commit; the plan is its
own commit) → `/speckit-tasks`.
