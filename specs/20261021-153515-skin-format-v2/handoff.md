# Handoff: Skin Format v2 and Skin Library

**Updated**: 2026-10-21 17:02 | **Spec**: [spec.md](spec.md) | **Branch**: `feat/20261021-153515-skin-format-v2`

## State

Implemented. All tasks in [tasks.md](tasks.md) are done and the tests pass.

## Done in the last session

- Format 2: lightbar and original colors, decorations, fixed controls and d-pad sticks.
- The controller draws them, sends the d-pad from d-pad sticks, shows dim lightbar colors from
  games brightened, and receives the game's last lightbar when a phone joins.
- The host serves a skin library with a default skin; each phone picks its skin and switches
  without reconnecting.
- The app lists the library, chooses the default skin, checks installed skins and shows each
  phone's skin; its data lives in a folder beside the program.

## Decisions

- None outside the spec.

## Open questions

- None.

## Next step

None. Further work on skins starts a new spec.
