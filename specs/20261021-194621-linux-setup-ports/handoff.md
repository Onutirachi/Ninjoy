# Handoff: Linux Setup Button and Port Choice

**Updated**: 2026-10-30 | **Spec**: [spec.md](spec.md) | **Branch**: `feat/20261021-194621-linux-setup-ports`

## State

Specification written and clarified; no plan yet. The clarification changes are not committed
yet (waiting for the maintainer's validation).

## Done in the last session

- Ran `/speckit-clarify` (6 questions, see the spec's Clarifications section).

## Decisions

- The setup is one button for everything, approved by the maintainer.
- Controller permission goes to whoever is logged in at the PC's local session (no logout needed).
- The firewall opening accepts only private local network ranges, for the ports and mDNS.
- No undo in the app: the README documents how to remove each item; packages handle it later.
- A port change restarts only the phone server, right away (no "Restart now" button), with a
  short notice that connected phones have to reconnect. Virtual controllers stay connected for
  games. Phones rejoin by scanning their controller's QR code again, with no follow mechanism
  (this replaces the old FR-010 question).
- The Linux items are checked at start, after a setup run and each time the status panel opens.

## Open questions

- None blocking. Ideas for later specs: Steam Cloud sync for the Steam build (skins and
  preferences only; ports, certificate and the Linux setup stay per machine).

## Next step

Commit the clarified spec after the maintainer validates it, then run `/speckit-plan`.
