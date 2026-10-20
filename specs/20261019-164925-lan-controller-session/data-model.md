# Data Model: LAN Controller Session v1

## Slot (host)

| Field | Type | Notes |
|---|---|---|
| number | u16 ≥ 1 | unique; lowest free number on creation |
| status | Waiting · Connected · Held | see transitions |
| device | DeviceId (16 bytes) or none | the device holding or holding-in-grace |
| summary | DeviceSummary or none | model + browser from the User-Agent |
| connected_since | time or none | |
| last_state | ControllerState or none | for the host UI |
| last_seq | u32 | newest accepted sequence of the current connection |
| rtt | duration or none | from PING/PONG |
| connection | handle or none | sender for feedback/kick messages |
| held_until | instant or none | end of the grace period |

### Transitions

```text
              create_slot()                 HELLO(slot or 0)
   (free) ───────────────▶ Waiting ───────────────────────────▶ Connected
     ▲  remove_slot()        │                                   │  ▲
     └───────────────────────┘                loss 1 s / close   │  │ HELLO from the same device
     ▲                                                           ▼  │ within grace
     │                         grace expires                   Held ┘
     └──────────────────────────────────────────────────────────┘
   (free) ◀── kick() from Connected or Held (immediate)
   (free) ── HELLO(n or 0) on a free number ──▶ Connected
```

- Entering **Held** (loss, close) or receiving HIDDEN/kick → the sink gets `NEUTRAL` first.
- A HELLO for a slot in **Connected** or **Held** by another device → IN_USE with an offer;
  by the same device → resume (Held) or replace the older connection (Connected, older gets
  OPENED_ELSEWHERE).
- HELLO with slot 0 → lowest **Waiting** slot, else lowest free number.

## DeviceId (page + host)

16 random bytes created by the page on first visit, stored in
`localStorage['ninjoy.v1.device']` (hex). Lost when site data is cleared; then the device is
treated as new. Not tied to the player or the hardware.

## ControllerState on the wire

See [contracts/protocol.md](contracts/protocol.md) (STATE). Neutral state: buttons 0, sticks
0, triggers 0, flags gyro as last reported, no touches, no motion.

## Feedback

| Field | Range | Page behavior |
|---|---|---|
| rumble strong, weak | 0…1 (sent as 0…255) | vibrate `max(strong, weak) × 100` ms per 100 ms cycle; 0 stops |
| lightbar | RGB | CSS property `--ninjoy-lightbar`; development panel swatch |

## Session events (host)

`SlotCreated`, `Connected`, `Reconnected`, `Disconnected`, `Freed`, `Kicked` — see
[contracts/host-core-api.md](contracts/host-core-api.md).

## Page connection status

| Status | Screen (FR-018) |
|---|---|
| connecting | splash, then "connecting" notice if still not joined |
| joined | controller (slot number shown briefly) |
| in-use | "controller in use" + button "join as controller N" |
| opened-elsewhere | notice, button "use here" (sends HELLO again) |
| kicked | "disconnected by the host" + button "join again" |
| unavailable | "host not available, trying again…" (automatic retries) |
| update-needed | "update needed" (version mismatch) |
| portrait-phone | "turn the device sideways" (overlays any status) |

## Host files

| Path | Content |
|---|---|
| `<data dir>/cert.pem`, `<data dir>/key.pem` | self-signed certificate and key (created on first run) |
