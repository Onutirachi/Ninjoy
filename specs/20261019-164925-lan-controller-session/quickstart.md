# Quickstart: validating the LAN controller session

## Prerequisites

- Node.js 26 and Rust 1.85+; repository root: `npm install`
- Chromium for browser tests: `npx playwright install chromium`
- A phone on the same Wi-Fi as the PC; allow the development host through the PC firewall on
  private networks.

## 1. Automated tests

```bash
npm run build --workspace @ninjoy/controller   # the host serves this build
npm test                                       # TypeScript unit + browser tests
cargo test --workspace                         # Rust unit + integration tests
cargo test --release -p ninjoy-session -- --ignored perf   # SC-002 / SC-007 benchmark
```

| Group | Proves |
|---|---|
| Rust codec + `vectors.json`, TS codec | the wire layout of [contracts/protocol.md](contracts/protocol.md) is identical on both sides |
| Rust slots | lowest free number, waiting slots, held slots, reuse, in-use offers (US1, US3, FR-006/006a/007) |
| Rust timers (paused clock) | loss 1 s → neutral, grace 60 s → freed, kick → neutral + freed (US2, SC-004/005) |
| Rust integration (real WebSocket, TLS) | join, reconnect, opened elsewhere, kick, feedback, HIDDEN, out-of-order states dropped |
| Rust LAN filter | public peer addresses refused (FR-005) |
| Browser: session client | HELLO/WELCOME, URL becomes `/<n>`, reconnect with backoff, hidden → HIDDEN, rumble pulses, screens |
| Perf (ignored by default) | p95 decode-to-sink < 1 ms with 32 clients × 120 states/s (SC-002, SC-007) |

## 2. Try it with phones

```bash
cargo run -p ninjoy-devhost
```

The development host prints the addresses, for example:

```text
Ninjoy session — secure https://ninjoy.local/  https://192.168.0.10/
                 plain  http://ninjoy.local/   http://192.168.0.10/
commands: list | create | remove <n> | kick <n> | watch <n> | rumble <n> <strong> <weak> | light <n> <#rrggbb> | quit
```

1. On a phone open `http://192.168.0.10/` → explanation page → "Open controller" → accept the
   certificate warning once → splash → controller 1. Add `?dev` to see slot, RTT and lightbar.
2. Second phone → controller 2. `create` on the host → controller 3 waiting; scan or open
   `/3` → it joins slot 3.
3. `watch 1` and press buttons: states print in order. Turn gyro on: motion appears.
4. Hold a button, turn the phone's Wi-Fi off: within about 1 s the host prints a neutral state;
   turn it on within 60 s: the phone comes back as the same number.
5. Open `/1` on another phone: "controller in use" with the offer.
6. `rumble 1 1 0` then `rumble 1 0 0`: the Android phone vibrates and stops; `light 1
   #ff0000`: the development panel shows red.
7. `kick 2`: phone 2 shows "disconnected by the host" and stays disconnected until "join
   again".
8. iPhone: if the secure page fails, "Continue without motion sensors" on the explanation page
   still gives a working controller.
9. Turn a phone upright: "turn the device sideways"; a tablet upright keeps the controller.
