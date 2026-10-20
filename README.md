# Ninjoy

Turn any phone or tablet into a game controller — no app install required.

Ninjoy runs on your PC (Windows and Linux), creates virtual DualShock 4 / Xbox 360
controllers, and serves a touch controller page to every device on the same local
network. Each player scans a QR code, opens the page in their browser, and plays.

> 🚧 Early development. The project follows Spec-Driven Development with
> [Spec Kit](https://github.com/github/spec-kit): specs live in `specs/`, and the
> project principles live in `.specify/memory/constitution.md`.

## Repository layout

| Path | What it is |
|---|---|
| `controller/` | The touch controller page (TypeScript + Vite): renders a skin, turns touches into a DS4 state and sends it to the host |
| `host/session/` | `ninjoy-session` (Rust): the host's network core — serves the page over HTTPS, announces `ninjoy.local`, numbers the controllers and receives their states |
| `host/devhost/` | `ninjoy-devhost`: runs the network core from a terminal, for testing with real phones |
| `assets/brand/` | Ninjoy logo files (not GPL, see `TRADEMARKS.md`) |
| `packages/skin-format/` | `@ninjoy/skin-format`: skin manifest schema, loader, validator and resolver |
| `skins/ninjoy/` | The official Ninjoy skin (not GPL, see its `LICENSE.md`) |
| `docs/skins/format.md` | How to create a skin |
| `specs/` | Feature specifications, plans and task lists |

The virtual DualShock 4 device and the desktop app will be added by upcoming features.

## Development

Requires Node.js 26 and Rust 1.88 or newer.

```bash
npm install          # install workspace dependencies
npm run typecheck    # TypeScript checks
npm test             # all tests (controller browser tests need: npx playwright install chromium)

# run the controller page; add ?dev to the URL to see the live controller state
npm run dev --workspace @ninjoy/controller

# run the host from a terminal: phones on the same network open the printed address
npm run build --workspace @ninjoy/controller   # the host serves this build
cargo run -p ninjoy-devhost                    # then type commands: list, watch 1, kick 2, create, quit
cargo test --workspace                         # Rust tests

# validate a skin folder or .ninjoyskin file (add --lang pt for Portuguese)
npm run validate --workspace @ninjoy/skin-format -- ../../skins/ninjoy
```

If phones cannot open the page, allow `ninjoy-devhost` through the PC firewall on private
networks. On Linux, ports 80/443 need permission; the host falls back to 8080/8443 and prints
the addresses with the port.

## License

Ninjoy's source code is free software released under the
[GNU General Public License v3.0](LICENSE), with an
[additional permission](LICENSE-EXCEPTIONS.md) for linking with the Steamworks SDK.

The Ninjoy name, logo and official skins are not covered by the GPL; see
[TRADEMARKS.md](TRADEMARKS.md).
