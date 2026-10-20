# Research: LAN Controller Session v1

Decisions for the open points of [plan.md](plan.md). Crate and package versions checked on
2026-10-20 (`cargo search`, `npm view`).

## R1. Host stack

- **Decision**: A Cargo workspace at the repository root with two members:
  - `host/session` — library crate `ninjoy-session` (the network core);
  - `host/devhost` — binary crate `ninjoy-devhost` (the development host).
  Async runtime **tokio 1.54**; HTTP routing and WebSocket upgrade with **axum 0.8**; TLS with
  **axum-server 0.8** (`tls-rustls-no-provider`) with **rustls 0.23** using the **ring** crypto
  provider (rustls' default, aws-lc, needs extra build tools on Windows).
  Logs with **tracing 0.1** + **tracing-subscriber 0.3** (devhost only installs the subscriber).
- **Rationale**: tokio is the runtime Tauri already uses, so the desktop app can host the core
  in-process. axum gives routing, static files and WebSocket upgrade in one maintained crate;
  axum-server adds rustls-based HTTPS without OpenSSL (no system library on Windows/Linux).
  All crates are MIT or MIT/Apache-2.0, compatible with GPL-3.0.
- **Alternatives considered**: hyper + tokio-tungstenite by hand (more code for the same
  result); actix-web (second runtime model next to Tauri's tokio); OpenSSL via native-tls
  (system dependency, harder Windows builds).

## R2. Certificate

- **Decision**: On first run generate an ECDSA P-256 self-signed certificate with **rcgen
  0.14** (subject alternative names: `ninjoy.local`, `localhost`, and the LAN IP addresses
  found at that moment), valid for 10 years, and store `cert.pem` + `key.pem` in the app data
  directory (**directories 6**: `%APPDATA%\Ninjoy` / `~/.local/share/ninjoy`). Reuse it on
  every run; regenerate only if the files are missing or unreadable.
- **Rationale**: browsers accept an untrusted certificate once per host after the player taps
  through the warning; keeping the same certificate means no new warning on later visits. The
  names in the certificate do not make it trusted, but listing them avoids an extra "wrong
  name" message on some browsers.
- **Risk**: iOS Safari has had problems opening secure WebSockets to a self-signed host even
  after the page was accepted. **Mitigation** (also R4): the plain address can open the same
  controller without motion sensors, so an iPhone always has a working path.
- **Alternatives considered**: a public certificate for a real domain resolving to private
  IPs (needs internet and a service, violates principle II); a local CA installed on each
  phone (too hard for players).

## R3. Ports and addresses

- **Decision**: Secure server on **443**, plain server on **80**; if a port cannot be bound
  (in use, or no permission on Linux without `CAP_NET_BIND_SERVICE`), fall back to **8443** /
  **8080** and print addresses with the port. Bind on all interfaces (IPv4 and IPv6). List
  reachable addresses with **if-addrs 0.15**, skipping loopback, link-local and well-known
  virtual adapters (Hyper-V/WSL `vEthernet`, VirtualBox, VMware, Docker) for display.
- **LAN-only**: every TCP connection whose peer address is not private (10/8, 172.16/12,
  192.168/16, 100.64/10, 169.254/16, 127/8, IPv6 ULA fc00::/7, link-local fe80::/10, ::1) is
  closed before TLS. The host never opens outbound connections.
- **Rationale**: ports 443/80 give the short address `ninjoy.local/1`; the fallback keeps the
  host usable without admin rights. The desktop installer may later grant the Linux
  capability.

## R4. Plain address behavior

- **Decision**: The plain server answers `/` and `/<n>` with an **explanation page** (built by
  the controller app, translated like the rest of the page): the browser will warn once about
  the certificate; how to continue on Android and iPhone; a button "Open controller" to
  `https://<same host>/<n>` and a secondary link "Continue without motion sensors" to
  `http://<same host>/<n>?plain` that loads the controller over plain HTTP and plain
  WebSocket. Everything else (page assets, WebSocket) is served on both servers.
- **Rationale**: the explanation page is FR-004; the plain fallback guarantees a working
  controller even when a browser refuses the certificate (R2 risk), at the cost of gyro.
- **Spec impact**: FR-004 gains the "continue without motion sensors" link (updated in the
  spec).

## R5. Local name (mDNS)

- **Decision**: **mdns-sd 0.21** (pure Rust, no async runtime dependency, MIT/Apache-2.0)
  announces the host name `ninjoy.local` with the A/AAAA records of the LAN interfaces, plus
  a service `_ninjoy._tcp` (for future discovery). Before announcing, the host resolves
  `ninjoy.local` for 1 s; if another host answers, it tries `ninjoy-2.local`, `ninjoy-3.local`…
- **Rationale**: no system service needed on Windows (no Bonjour install) or Linux (works
  next to Avahi through shared port 5353).
- **Risk**: Windows' own mDNS responder also uses port 5353; mdns-sd binds with address reuse
  and works alongside it in practice. Android browsers often cannot resolve `.local`; the IP
  address is the documented fallback and the QR codes will use it.

## R6. Serving the controller page

- **Decision**: The page is built by Vite (`npm run build --workspace @ninjoy/controller`) into
  `controller/dist/`. The session crate serves it from an **embedded copy in release builds**
  (**rust-embed 8**, `folder = "../../controller/dist"`) and **from disk in debug builds**
  (rust-embed's default debug behavior), so `cargo run` picks up a fresh `npm run build`
  without recompiling. Routes: `/` and `/<n>` → `index.html` (secure server) or the
  explanation page (plain server, unless `?plain`); `/assets/*` → files; `/ws` → WebSocket.
  The official skin stays bundled in the page as today; choosing skins from the host is a
  later feature.
- **Rationale**: one self-contained binary for players; no build script calling npm (CI
  builds the page before `cargo build`).

## R7. Wire protocol

- **Decision**: Binary WebSocket messages, little-endian, first byte = message type,
  `PROTOCOL_VERSION = 1` sent in HELLO and WELCOME. Full layout in
  [contracts/protocol.md](contracts/protocol.md). Highlights:
  - **STATE** (page → host, 21–55 bytes): sequence (u32), buttons bitmask (u32, DS4 order),
    sticks as i16 (−32767…32767, y down), triggers as u8 (0–255, like a real DS4), flags
    (gyro on, touchpad click), up to 2 touches (id u8, x/y u16 over the whole touchpad),
    motion as f32 (rate °/s, acceleration m/s²) only when gyro is on.
  - Each STATE carries the **full** state; the host keeps the newest sequence per connection
    and drops older ones; the page resends the current state every **250 ms** when idle.
  - **PING/PONG** every 1 s from the host for round-trip time; the next PING carries the last
    RTT so the page can show it.
  - **FEEDBACK** (host → page): rumble strong/weak (u8), lightbar RGB, with flags telling which
    are present.
- **Rationale**: fixed layout, no allocations to decode (read into a reused struct), tiny
  messages (≈ 21–55 bytes) well under one Wi-Fi frame. Floats only for motion, where range and
  precision both matter and the host converts units for the device backend.
- **Shared test vectors**: `host/session/tests/vectors.json` lists messages with their
  expected bytes; both the Rust codec tests and the TypeScript codec tests read it.

## R8. Slots, identity and timers

- **Decision**:
  - Device identity: 16 random bytes (`crypto.getRandomValues`) stored in
    `localStorage['ninjoy.v1.device']`, sent in HELLO. Not personal data.
  - Slot table: a `BTreeMap<u16, Slot>` behind one `std::sync::Mutex` held only for short,
    non-awaiting sections; lowest free number = first gap from 1.
  - Timers per connection (tokio): **loss timeout 1 s** since the last message → neutral state
    and "disconnected" event, slot becomes **held**; **grace 60 s** → slot freed. Kick → kicked
    message, close, neutral state, free at once. A HELLO from the same device for its held
    slot resumes it; a newer connection from the same device replaces the older one
    (OPENED_ELSEWHERE to the old one).
  - Waiting slots (FR-006a) are created/removed through the core API. The bare address `/`
    opens the controller list (FR-006b): the page sends LIST and receives SLOT_LIST on every
    change (a broadcast of the slot table version wakes listing connections); tapping a
    controller sends HELLO with its number, "new controller" sends HELLO with 0.
- **Rationale**: a single lock is simpler than actors at this scale (≤ dozens of slots); the
  state hot path does not take the lock (each connection owns its own state and sink call).

## R9. Receiver (sink) and events

- **Decision**: `trait StateSink: Send + Sync { fn on_state(&self, slot: u16, state: &ControllerState); }`
  called synchronously on the connection task right after decoding (no channel hop, no
  allocation). Neutral states go through the same call. Session events (created, connected,
  reconnected, disconnected, freed, kicked) go to a `tokio::sync::broadcast` channel. Feedback
  to a slot is a `send_feedback(slot, Feedback)` method that forwards through the connection's
  bounded mpsc channel (dropped if the slot is not connected).
- **Rationale**: the future device backend writes a report per state, which is fast and
  non-blocking (ViGEm/UHID calls), so a direct call gives the lowest latency. The trait is
  the boundary the constitution already expects (device-backend interface).

## R10. Page session client

- **Decision**: `controller/src/platform/session.ts` opens `wss://<host>/ws` (or `ws://` in
  plain mode), sends HELLO, then encodes every published `ControllerState` (via the existing
  `subscribe`) into one reused `ArrayBuffer`; a 250 ms idle timer resends the last state;
  `visibilitychange` hidden → HIDDEN message; reconnect with backoff 250 ms → 4 s while
  visible. After WELCOME the URL becomes `/<n>` (`history.replaceState`) so a reload keeps the
  slot. The codec lives in `controller/src/engine/protocol.ts` (pure, unit tested).
- **Rumble**: browsers only switch vibration on/off, so intensity becomes pulses: within each
  100 ms cycle vibrate for `max(strong, weak) × 100` ms (`navigator.vibrate([on, off])`
  repeated while rumble is non-zero); zero rumble or hidden page calls `navigator.vibrate(0)`.
- **Lightbar**: exposed on the controller as a CSS custom property `--ninjoy-lightbar` on the
  root (skins may use it later) and shown in the development panel.

## R11. Splash, notice screens and fonts

- **Decision**: `controller/src/ui/screens.ts` renders the splash (FR-018a) and every notice
  (FR-018) in one component: logo (one-color SVG `LOGOMONOFULL`, `currentColor`), pulsing
  message, optional buttons, over a slowly moving background pattern made of the one-color
  ninja and wordmark (no third-party symbols). Fonts: **@fontsource-variable/manrope 5.3**
  (UI text) and **@fontsource/chakra-petch 5.3** (numbers and titles), both OFL-1.1, bundled
  by Vite as woff2 files (no internet). Brand files live in `assets/brand/` (outside the GPL,
  see TRADEMARKS.md) and are imported by the page.
- **Rationale**: the look validated in the maintainer's old prototype and the host prototype
  (`drafts/host-ui`), with fonts whose license allows bundling.

## R12. Testing

- **Decision**:
  - Rust unit tests: codec (vectors), slot allocation (lowest free, waiting slots, held,
    reuse), timers with `tokio::time::pause()` (loss 1 s, grace 60 s, keepalive), LAN address
    filter, user-agent summary.
  - Rust integration tests: start the core on random ports with a test certificate; connect
    real clients with **tokio-tungstenite 0.30** (dev-dependency) over plain WS and over TLS
    (test-only verifier accepting the generated certificate); cover join, in-use, opened
    elsewhere, kick, reconnect within grace, loss → neutral, feedback delivery.
  - TypeScript unit tests: codec against the shared vectors; rumble pulse computation.
  - Browser tests (existing Vitest + Playwright): session client against an in-test mock
    WebSocket server (Vitest browser mode `server` commands run Node code) — reconnect, hidden,
    URL update, screens.
  - Performance: an ignored-by-default Rust test (`cargo test --release -- --ignored perf`)
    runs 32 clients × 120 states/s for 10 s and asserts p95 decode-to-sink < 1 ms (SC-002,
    SC-007).
  - CI: the existing `test` job also installs Rust, runs `cargo fmt --check`, `cargo clippy
    -- -D warnings` and `cargo test --workspace`, after `npm run build` of the controller.
- **Rationale**: every acceptance scenario of the spec maps to an automated test; real phones
  are covered by the manual quickstart (SC-003, SC-008 need real Wi-Fi and vibration).

## R13. Development host

- **Decision**: `ninjoy-devhost` starts the core with defaults, prints the addresses (local
  name and IPs, secure and plain), logs session events, and reads simple commands from stdin:
  `list`, `create [n]`, `remove <n>`, `kick <n>`, `watch <n>` (print states), `rumble <n> <strong>
  <weak>`, `light <n> <#rrggbb>`, `quit`. Options: `--port`, `--plain-port`, `--grace`,
  `--name`, `--web <dir>`.
- **Rationale**: lets the whole path be tested with real phones before the desktop app; no CLI
  framework needed for a handful of commands (standard library argument parsing).

## R14. Dependency summary

| Dependency | Purpose | License | Where |
|---|---|---|---|
| tokio 1.54 | async runtime | MIT | session, devhost |
| axum 0.8 | routing, static files, WebSocket upgrade | MIT | session |
| axum-server 0.8 + rustls 0.23 (ring) | HTTPS | MIT; rustls Apache-2.0/MIT/ISC, ring ISC-style | session |
| rcgen 0.14 | self-signed certificate | MIT/Apache-2.0 | session |
| mdns-sd 0.21 | `ninjoy.local` announcement | MIT/Apache-2.0 | session |
| if-addrs 0.15 | list LAN addresses | MIT/BSD-3-Clause | session |
| directories 6 | app data directory | MIT/Apache-2.0 | session |
| rust-embed 8 | embed the built page | MIT | session |
| mime_guess 2 | content types for embedded files | MIT | session |
| tracing 0.1 / tracing-subscriber 0.3 | logs | MIT | session / devhost |
| tokio-tungstenite 0.30 | test WebSocket client | MIT | dev-dependency |
| @fontsource-variable/manrope 5.3, @fontsource/chakra-petch 5.3 | bundled OFL fonts | OFL-1.1 (fonts), MIT (package) | controller |

All are actively maintained and compatible with GPL-3.0 (OFL fonts are distributed as fonts,
not linked code).
