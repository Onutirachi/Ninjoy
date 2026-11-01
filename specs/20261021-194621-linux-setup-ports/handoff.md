# Handoff: Linux Setup Button and Port Choice

**Updated**: 2026-11-01 | **Spec**: [spec.md](spec.md) | **Branch**: `feat/20261021-194621-linux-setup-ports`

## State

Phases 2 and 3 are committed. T020 and Phase 5 (US3, T022–T025) are implemented and pass the
automated tests, validated by the maintainer on Windows and committed. The
manual checks (T021 touchpad, T027 single copy, T029 quickstart) were moved to the end by the
maintainer.

## Done in the last session

- T020 (on the Ubuntu VM, the CachyOS PC was off): the installed rule equals `TOUCHPAD_RULE`.
  With a pad created by the devhost (`uniq` `02:4e:4a:00:00:01`), `udevadm info` gives the
  Touchpad node `LIBINPUT_IGNORE_DEVICE=1`; the joystick and motion sensor nodes do not get it.
  No real DS4 was available; a factory MAC never starts with `02:` (locally administered bit).
- Phase 5, US3 (Ports):
  - `AppCore::update_settings` is async and returns `Result<SettingsResult, String>`. A changed
    ports setting is validated, then `restart_servers` runs; on error nothing is saved and the
    message is `port <n>: <reason>`. After a move the Linux setup is checked again (FR-012).
  - `set_settings` (Tauri) returns it.
  - Settings popover: a Ports row (Automatic / Custom). Automatic saves at once; Custom shows
    the secure and plain inputs and Save, validated in the window first (`portsProblem`). A
    failure shows "Ninjoy kept the previous ports." with the reason and the running setting.

## Decisions

All decisions are in the spec's clarifications (sessions 2026-10-30/31 and the layout review)
and in the contracts.

## Open questions

- The maintainer plans a full review of the UI and its messages once the first complete usable
  version is ready. Found while validating the Ports row (2026-11-01), left for that review:
  visual problems and scrolling in the settings popover, and a confusing error message when a
  port is taken (it works).

- On Windows, the status panel still shows the backend's English reason (ViGEmBus missing)
  untranslated. Ask the maintainer whether to translate it.
- The VM still has `/etc/sudoers.d/90-claude-test` (passwordless sudo for the tests). Remind the
  maintainer to delete it when the Linux tests end.
- To test the setup from scratch on the VM, run `~/undo-ninjoy-setup.sh` there (access in
  `drafts/HANDOFF.md`).

## Next step

Phase 6 (T026
test), Phase 7 (T028 README, T030 lint). Last: the manual checks T021, T027 and T029 (CachyOS
with Steam for T021).
