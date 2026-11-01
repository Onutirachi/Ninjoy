# Handoff: Linux Setup Button and Port Choice

**Updated**: 2026-11-01 | **Spec**: [spec.md](spec.md) | **Branch**: `feat/20261021-194621-linux-setup-ports`

## State

Phases 2 and 3 (T001–T019, T031–T034) are implemented, validated by the maintainer on the
Ubuntu 26.04 test VM and committed. Phase 4 (US2, touchpad checks) is next.

## Done in the last session

- Phase 3, US1: the Linux "Requirements" screen, reviewed on the VM over several rounds.
  - It replaces the main window at start while a Critical item is missing, or a Recommended
    one before "Continue anyway". Critical items (controllers, firewall) come first.
  - Each card expands into formal technical details, the commands in a terminal block, and a
    blue "Apply" plus a grey "Copy commands" for that item only.
  - Below the list: "Configure automatically", "Copy commands" and "Continue anyway".
  - While the screen is shown, the items are checked every 2 s, so commands run by hand turn
    green on their own. When every item is done: "All set!", then the main window.
  - Recommended items still missing have an "Ignore" switch (`settings.setup.ignored`, FR-018).
    An ignored item fades, except its buttons, which still work. It no longer counts as missing
    and is left out of Configure and Copy. A done item is never shown as ignored.
  - On Linux the status chip reads "Requirements OK" or "Requirements pending", and its panel
    is titled "Requirements".
  - Without the controller permission, "Create controller" is disabled and "Permission needed"
    takes the place of the empty list, with "See setup". Phones cannot create controllers.
  - Settings (Linux): "Controllers' touchpad moves the mouse", which removes or applies the
    touchpad rule with one password.
- Rust:
  - `DeviceHub::set_backend` plugs the controllers in without a restart.
  - pkexec without an authentication agent is reported as `noPrompt`, not as cancelled.
  - The script sets `umask 022`.
  - `CoreConfig.check_setup` keeps the tests independent of the host system.

## Decisions

All decisions are in the spec's clarifications (sessions 2026-10-30/31 and the layout review)
and in the contracts.

## Open questions

- On Windows, the status panel still shows the backend's English reason (ViGEmBus missing)
  untranslated. Ask the maintainer whether to translate it.
- The VM still has `/etc/sudoers.d/90-claude-test` (passwordless sudo for the tests). Remind the
  maintainer to delete it when the Linux tests end.
- To test the setup from scratch on the VM, run `~/undo-ninjoy-setup.sh` there (access in
  `drafts/HANDOFF.md`).

## Next step

Phase 4 (US2, T020–T021): compare `TOUCHPAD_RULE` with `udevadm` on the VM, then the manual
Steam Input check. Then Phase 5 (Ports in the settings, T022–T025).
