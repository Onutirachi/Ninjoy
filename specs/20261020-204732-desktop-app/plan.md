# Implementation Plan: Desktop App

**Branch**: `feat/20261020-204732-desktop-app` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

A Tauri 2 app (`host/app`, binary `ninjoy`) embeds the session and the device hub, shows the
interface from the approved prototype (`desktop/`, TypeScript + Vite, framework-free), lives in
the tray, can start with the system, remembers created controllers, and answers command line
requests (`ninjoy create|remove|kick|list`) over a per-user local channel that also keeps a
single running copy.

## Technical Context

**Language/Version**: Rust 2024 (workspace), TypeScript 7 + Vite 8 (npm workspace `desktop`).
**Primary Dependencies**: `tauri` 2 (features `tray-icon`), `tauri-build`,
`tauri-plugin-autostart` 2, `serde`/`serde_json`, `qrcode` (SVG QR codes), `directories`,
`ninjoy-session`, `ninjoy-devices`; frontend: none at runtime (fonts from `@fontsource`, brand
SVGs from `assets/brand`). All MIT/Apache, GPL-compatible.
**Storage**: `app.json` in the app data folder (settings + saved controller numbers).
**Testing**: Rust tests for the app core (commands, persistence, startup recreation) and the
local channel, without a window; Vitest browser tests for the UI against a mocked bridge;
manual run on Windows and Linux. CI installs the Linux web view packages and builds the UI
before `cargo clippy`/`cargo test` (Tauri embeds it at compile time).
**Performance Goals**: live view at the screen rate for the selected controller only; idle in
the tray under 5% of a core.
**Constraints**: one process; the channel accepts only the same user.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Fidelity | Pass | Uses the DS4 backend; pad status shown per controller. |
| II. Zero-install | Pass | Phones unchanged; the app shows driver guidance. |
| III. Latency | Pass | UI reads states off the hot path (snapshot per frame for one slot); the sink path is unchanged. |
| IV. Skins | Pass | Skins tab lists the bundled official skin only; import comes with the sanitizer feature. |
| V. Tested | Pass | Core and channel tests in Rust, UI tests in the browser, manual window checks. |
| VI. Simplicity | Pass | Own small channel instead of extra plugins for single instance and CLI; framework-free UI like the controller page. |

## Design

- **App core** (`host/app/src/core.rs`): owns `Session`, `DeviceHub`, `Store`; methods
  `snapshot()` (addresses, driver status, settings, controllers: number, state, device, since,
  rtt, pad status, last feedback), `controller_state(n)` (last state for the live view),
  `create(Option<u16>)`, `remove(n)`, `kick(n)`, `set_settings(..)`; recreates saved controllers
  at start; persists on every change. The session gains `set_grace(Duration)`.
- **Command channel** (`host/app/src/channel.rs`): one request line → one response (`ok <text>`
  / `error <text>`); requests `create [n]`, `remove n`, `kick n`, `list`, `show`. Windows: named
  pipe `\\.\pipe\ninjoy-<user>` (default security: only the owner and administrators can write);
  Linux: Unix socket `$XDG_RUNTIME_DIR/ninjoy.sock` (per-user 0700 folder). At start the app
  tries the channel first: if a copy answers, it sends `show` and exits.
- **CLI** (`main.rs`): with a command argument the binary is a client: sends it, prints the
  answer, exits 0 or 1; "Ninjoy is not running" when nobody answers.
- **Tauri shell** (`host/app/src/main.rs`): window without decorations (custom title bar with
  drag region), close → hide to tray (notice once), tray menu Open/Quit, autostart plugin with a
  `--tray` argument (start hidden), commands bridging the core (`snapshot`, `controller_state`,
  `create`, `remove`, `kick`, `settings`, `qr_svg`, `window_*`), an event `changed` when the
  session or feedback changes (the UI then asks for a snapshot).
- **UI** (`desktop/`): styles and layout ported from the prototype (tokens, depth, themes),
  modules: `bridge.ts` (Tauri invoke/listen, mockable), `list.ts`, `details.ts` (live view canvas
  of the controller drawing, motion phone shape, latency graph), `settings.ts`, `skins.ts`,
  `titlebar.ts`, `splash.ts`, `i18n/{en,pt}.json`.
- **Icons**: generated from `assets/brand/logo-ninja.svg` into `host/app/icons/`.

## Project Structure

```text
host/app/{Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, icons/}
host/app/src/{main.rs, core.rs, store.rs, channel.rs, cli.rs}
host/app/tests/{core.rs, channel.rs}
desktop/{package.json, index.html, vite.config.ts, tsconfig.json}
desktop/src/{main.ts, bridge.ts, list.ts, details.ts, settings.ts, skins.ts, titlebar.ts, splash.ts, styles.css, i18n/}
desktop/test/browser/*.test.ts
.github/workflows/ci.yml        Linux web view packages, desktop build
```
