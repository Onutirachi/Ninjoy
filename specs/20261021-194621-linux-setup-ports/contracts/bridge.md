# Contract: window ↔ app (Tauri commands)

Types are the camelCase JSON of the Rust structs in [data-model.md](../data-model.md).

## Changed

### `snapshot() -> Snapshot`

Adds:
- `settings.ports: PortsSetting`
- `setup: SetupView | null`, which is `null` on Windows. It holds the last check's result and
  does not run a check by itself.

`driver` stays as it is: the status chip warns while `driver.ok` is false (controller permission
missing or uhid unavailable).

### `set_settings(settings) -> Result<SettingsResult, string>`

- `SettingsResult = { portsMoved: boolean }`.
- When `settings.ports` differs from the running ports' setting:
  1. Validates it. An invalid entry gives `Err(reason)`, and nothing changes.
  2. Restarts the phone servers. On a bind failure it gives `Err("port <n>: <reason>")`, the
     previous ports keep running and the previous setting stays saved.
  3. On success: `portsMoved: true`.
- Other settings apply as today.

## New

### `setup_check() -> SetupView`

Runs the Linux check (FR-001). The window calls it each time the status panel opens. If the
controller permission became available, the hub gets its backend (FR-005).

### `setup_configure() -> SetupConfigureResult`

`SetupConfigureResult = { setup: SetupView, portsMoved: boolean }`

1. Runs the script for the missing items through `pkexec` (one password prompt).
2. Checks again (retrying the controller item for up to 2 s).
3. Hands the hub its backend when available.
4. In Automatic mode, if low ports are now allowed and the servers run on 8443/8080, restarts
   them on 443/80 (`portsMoved: true`).

`setup.outcome` is `"cancelled"` when the prompt was dismissed and `"noPrompt"` when there is
no agent or no `pkexec`. In both cases nothing changed.

## Window behavior

- **Status panel** (the driver chip's popover):
  - lists the items with their state and a one-line explanation;
  - shows one Configure button while any item is missing, and "ready" when none is;
  - after a run, shows each failed item's reason and its commands;
  - for `noPrompt`, says no password prompt is available and shows `allCommands` with a copy
    button;
  - for `cancelled`, says the setup was cancelled and shows `allCommands` with a copy button
    (FR-007);
  - with no firewall item, the panel's help mentions checking the firewall if phones cannot
    connect.
- **Settings**: a Ports row with Automatic / Custom; in Custom, the secure and plain inputs and
  a Save button. Invalid input shows the reason inline.
- **Notice**: when `portsMoved` is true, a short message says connected phones must scan their
  controller's QR code again.
