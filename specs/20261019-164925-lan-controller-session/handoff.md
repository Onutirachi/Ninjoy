# Handoff: LAN Controller Session v1

**Updated**: 2026-10-20 11:31 | **Spec**: [spec.md](spec.md) | **Branch**: `feat/20261019-164925-lan-controller-session`

## State

Implemented. All tasks in [tasks.md](tasks.md) are done and the tests pass.

## Done in the last session

- Rust workspace, run in CI.
- The host serves the controller page over HTTPS with a per-install certificate, exchanges
  states with phones and announces `ninjoy.local`.
- Phones join as numbered controllers, vibrate with the game's rumble and expose the lightbar.
- Splash, the request to turn upright phones, and the brick layout of the background wordmarks.
- Tests for loss, grace, reconnects, in-use answers and kicks, and a measurement of 32
  controllers at 120 states per second.

## Decisions

- None outside the spec.

## Open questions

- None.

## Next step

None. Further work on the session starts a new spec.
