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
| `packages/skin-format/` | `@ninjoy/skin-format`: skin manifest schema, loader, validator and resolver |
| `skins/ninjoy/` | The official Ninjoy skin (not GPL, see its `LICENSE.md`) |
| `docs/skins/format.md` | How to create a skin |
| `specs/` | Feature specifications, plans and task lists |

The controller page and the desktop host will be added by upcoming features.

## Development

Requires Node.js 26.

```bash
npm install          # install workspace dependencies
npm run typecheck    # TypeScript checks
npm test             # all tests

# validate a skin folder or .ninjoyskin file (add --lang pt for Portuguese)
npm run validate --workspace @ninjoy/skin-format -- ../../skins/ninjoy
```

## License

Ninjoy's source code is free software released under the
[GNU General Public License v3.0](LICENSE), with an
[additional permission](LICENSE-EXCEPTIONS.md) for linking with the Steamworks SDK.

The Ninjoy name, logo and official skins are not covered by the GPL; see
[TRADEMARKS.md](TRADEMARKS.md).
