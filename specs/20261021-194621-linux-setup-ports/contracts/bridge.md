# Contract: window ↔ app (Tauri commands)

Types are the camelCase JSON of the Rust structs in [data-model.md](../data-model.md).

## Changed

### `snapshot() -> Snapshot`

Adds:
- `settings.ports: PortsSetting`
- `settings.setup: SetupPrefs` (Linux start screen and touchpad choice)
- `setup: SetupView | null`, which is `null` on Windows. It holds the last check's result and
  does not run a check by itself.

`driver` stays as it is. On Windows the status chip warns while `driver.ok` is false; on Linux it
follows `setup.ready` ("Requirements OK" or "Requirements pending").

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

### `setup_configure(items: ItemId[] | null) -> SetupConfigureResult`

`SetupConfigureResult = { setup: SetupView, portsMoved: boolean }`

1. Runs the script for the missing items (all of them, or only `items`: an item's own apply
   button) through `pkexec` (one password prompt).
2. Checks again (retrying the controller item for up to 2 s).
3. Hands the hub its backend when available.
4. In Automatic mode, if low ports are now allowed and the servers run on 8443/8080, restarts
   them on 443/80 (`portsMoved: true`).

`setup.outcome` is `"cancelled"` when the prompt was dismissed and `"noPrompt"` when there is
no agent or no `pkexec`. In both cases nothing changed.

### `setup_touchpad_mouse(on: boolean) -> SetupConfigureResult`

FR-016. `on` removes the touchpad rule, `off` applies it (one password prompt). The setting
`settings.setup.touchpadMouse` changes only when the run succeeded. While it is on, the touchpad
item is not listed.

## Window behavior

- **Start screen** (Linux): shown instead of the controller list at start when a Critical item is
  missing, or when any item is missing and `settings.setup.skippedRecommended` is false.
  - "Requirements", then the items, Critical ones first: a light, a Critical/Recommended flag
    (`item.critical`), the title and the summary. A click expands the details, the commands
    (terminal block), an "Apply" button (`setup_configure([id])`) and a "Copy commands" button
    for that item.
  - A Recommended item still missing has an "Ignore" switch (saves `settings.setup.ignored`).
    Ignored items fade and no longer count as missing, here and for the status chip.
  - Below: "Configure automatically" (`setup_configure(null)`, or the ids of the missing items
    that are not ignored when some are), "Copy commands" (the commands of those items) and
    "Continue anyway" (saves `skippedRecommended: true`).
  - While shown, `setup_check()` runs every 2 s. A failed item shows its output in a terminal
    block. `cancelled` and `noPrompt` show their message and the commands with a copy button.
  - With every item done: "All set!", then the normal window.
- **Main window without the controller permission**: "Create controller" is disabled, and the
  empty list place says "Permission needed" with a "See setup" button that opens the start
  screen.
- **Status panel** (the driver chip's popover): the items with their light, and "See setup"
  while any is missing; with no firewall item, the help mentions checking the firewall if
  phones cannot connect.
- **Settings**:
  - a Ports row with Automatic / Custom; in Custom, the secure and plain inputs and a Save
    button. Invalid input shows the reason inline;
  - on Linux, "Controllers' touchpad moves the mouse" (`setup_touchpad_mouse`).
- **Notice**: when `portsMoved` is true, a short message says connected phones must scan their
  controller's QR code again.
