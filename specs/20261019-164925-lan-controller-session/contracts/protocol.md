# Contract: Controller ↔ Host Wire Protocol v1

Binary WebSocket messages at `wss://<host>/ws` (or `ws://<host>/ws` in plain mode). Every
message is one binary frame. All integers are **little-endian**; floats are IEEE-754 `f32`
little-endian. The first byte is the message type. Unknown types are ignored by both sides
(forward compatibility within a version); a malformed known message closes the connection
with close code 1007.

`PROTOCOL_VERSION = 1`.

## Handshake

```text
page                                   host
 │── HELLO(version, slot, device) ───────▶│
 │◀────────────── WELCOME(version, slot) ──│   joined (or resumed) the slot
 │◀──── IN_USE(requested) ─────────────────│   slot taken by another device → page shows notice
 │◀──── VERSION_MISMATCH(host_version) ────│   then the host closes
 │── STATE … (on every change, 250 ms idle) ─▶│
 │◀──────────── PING(nonce, last_rtt) ─────│   every 1 s
 │── PONG(nonce) ─────────────────────────▶│
 │◀──── FEEDBACK(rumble, lightbar) ────────│   any time
 │── HIDDEN ──────────────────────────────▶│   page hidden → host reports a neutral state
 │◀──── KICKED / OPENED_ELSEWHERE ─────────│   then the host closes
```

The host sends nothing but WELCOME / IN_USE / VERSION_MISMATCH before a valid HELLO, and
ignores STATE before WELCOME. A connection that sends no HELLO within 5 s is closed.

## Page → host

### 0x01 HELLO (20 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | type = 0x01 |
| 1 | u8 | protocol version |
| 2 | u16 | requested slot (0 = new controller: lowest free number; refused with IN_USE(0) when phones may not create controllers) |
| 4 | u8[16] | device identity (random, kept in `localStorage['ninjoy.v1.device']`) |

The device summary shown on the host (e.g. "Galaxy S23 · Chrome") comes from the HTTP
`User-Agent` of the WebSocket upgrade request, not from the message.

### 0x02 STATE (21–55 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | type = 0x02 |
| 1 | u32 | sequence (increments per message, wraps; host compares with wrap-around) |
| 5 | u32 | buttons bitmask, bit = index in DS4 order: cross 0, circle 1, square 2, triangle 3, up 4, down 5, left 6, right 7, l1 8, r1 9, l2 10, r2 11, l3 12, r3 13, share 14, options 15, ps 16, touchpad 17 |
| 9 | i16 ×4 | left x, left y, right x, right y (−32767…32767; x right, y down) |
| 17 | u8 ×2 | l2, r2 force (0…255) |
| 19 | u8 | flags: bit0 gyro on, bit1 motion present, bits2–3 touch count (0–2) |
| 20 | u8 | reserved (0) |
| 21 | touches | per touch: id u8, x u16, y u16 (0…65535 over the whole DS4 touchpad) — 5 bytes each |
| … | motion | if flags.bit1: rate x, y, z (f32, °/s) then accel x, y, z (f32, m/s²) — controller frame |

Conversion from the page's `ControllerState`: sticks `round(v × 32767)`, triggers
`round(v × 255)`, touch coordinates `round(v × 65535)`. Digital `l2`/`r2` bits are set while the
force is above 0 (as in the state). Motion is present only while gyro is on and a sample
exists.

### 0x03 HIDDEN (1 byte)

The page went to the background. The host reports a neutral state for the slot at once and
keeps the connection; the next STATE resumes input.

### 0x05 LIST (1 byte)

Sent instead of HELLO by the controller list page (`/`). The host answers with SLOT_LIST and
sends a new SLOT_LIST whenever a slot changes, until the connection closes or a HELLO follows
on the same connection (the page then joins the chosen slot).

### 0x04 PONG (5 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | type = 0x04 |
| 1 | u32 | nonce copied from PING |

## Host → page

### 0x81 WELCOME (4 bytes)

| 0 | u8 | type = 0x81 | 1 | u8 | protocol version | 2 | u16 | slot number |
|---|---|---|---|---|---|---|---|---|

### 0x82 IN_USE (3 bytes)

| 0 | u8 | type = 0x82 | 1 | u16 | requested slot (0 = new controllers are not allowed) |
|---|---|---|---|---|---|

The connection stays open; the page offers the controller list (it may send LIST).

### 0x83 OPENED_ELSEWHERE (1 byte)

The same device opened this slot in another tab/connection. The host closes this one.

### 0x84 KICKED (1 byte)

The host removed the player. The page shows "disconnected by the host" and does not
reconnect by itself.

### 0x85 VERSION_MISMATCH (2 bytes)

| 0 | u8 | type = 0x85 | 1 | u8 | host protocol version |
|---|---|---|---|---|---|

### 0x86 FEEDBACK (7 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | type = 0x86 |
| 1 | u8 | flags: bit0 rumble present, bit1 lightbar present |
| 2 | u8 | rumble strong motor (0…255) |
| 3 | u8 | rumble weak motor (0…255) |
| 4 | u8 ×3 | lightbar r, g, b |

### 0x88 SLOT_LIST (3 + 3·n bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | type = 0x88 |
| 1 | u8 | flags: bit0 phones may create controllers |
| 2 | u8 | n = number of entries (if more than 255 slots exist, the first 255 by number) |
| 3 | entries | per slot: number u16, status u8 (0 waiting, 1 connected, 2 held, 3 held for this device) |

Device names are not sent to other players.

### 0x87 PING (7 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | type = 0x87 |
| 1 | u32 | nonce |
| 5 | u16 | last measured round-trip time in 0.1 ms units (0 = unknown, saturates at 65535) |

## Timing rules

| Rule | Value | Who |
|---|---|---|
| Send STATE on every state change | same task as the change | page |
| Resend current STATE when idle | every 250 ms | page |
| Loss timeout (no message) → neutral state, slot held | 1 s | host |
| Grace period for a held slot | 60 s (configurable) | host |
| PING interval | 1 s | host |
| HELLO deadline after connect | 5 s | host |
| Reconnect backoff while visible | 250 ms doubling to 4 s | page |

## Test vectors

`host/session/tests/vectors.json` holds named messages with their decoded fields and
expected bytes (hex). Both the Rust codec tests and `controller/test/unit/protocol.test.ts`
encode and decode every vector; a change to the layout must update the vectors and the
protocol version.
