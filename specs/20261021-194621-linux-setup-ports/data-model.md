# Data Model: Linux Setup Button and Port Choice

## PortsSetting (`app.json` → `settings.ports`)

| Field | Type | Rule |
|---|---|---|
| `mode` | `"automatic"` \| `"custom"` | default `"automatic"` |
| `secure` | u16 | used in Custom; 1–65535; default 443 |
| `plain` | u16 | used in Custom; 1–65535; different from `secure`; default 80 |

- Missing in an older `app.json` → defaults (serde `default`).
- `PortsSetting::validate()` → `Ok` or `PortsError::{OutOfRange, Same}`.
- Port lists for the session:
  - Automatic: secure `[443, 8443]`, plain `[80, 8080]`;
  - Custom: secure `[secure]`, plain `[plain]`.
- `wanted_low_port()`: the lowest port below 1024 the setting wants, if any (Automatic: 80).

## SetupItem (Linux only; built by each check, not stored)

| Field | Type | Notes |
|---|---|---|
| `id` | `"controllers"` \| `"touchpad"` \| `"ports"` \| `"firewall"` | |
| `state` | `"done"` \| `"missing"` \| `"failed"` | `failed` only right after a run |
| `reason` | string? | raw reason when failed (command output) |
| `commands` | string[] | the manual commands (`sudo …`) for this item |
| `firewall` | `"ufw"` \| `"firewalld"`? | only for `firewall` |

- `ports` is present only when `wanted_low_port()` is some.
- `firewall` is present only when ufw or firewalld is active.
- The explanation text comes from the window's locale files by `id`.

State transitions:

```text
missing --Configure ok--> done
missing --Configure item error--> failed --next check--> missing | done
done --rule removed by hand / ports changed--> missing   (next check)
```

## SetupView (window; part of the snapshot and of the command results)

| Field | Type | Notes |
|---|---|---|
| `items` | SetupItem[] | in the order of FR-001 |
| `ready` | bool | every item is done |
| `outcome` | `"cancelled"` \| `"noPrompt"` \| `null` | the last Configure run, when it did not run the script |
| `allCommands` | string | every missing item's commands, for copying |

`setup` in the snapshot is `null` on Windows.

## SetupRecord (`linux-setup.json` in the data folder)

| Field | Type | Notes |
|---|---|---|
| `ufw` | `{ secure: u16, plain: u16 }`? | the ports whose ufw rules the last run added |

Written after a run whose firewall item succeeded with ufw. It is used to check ufw and to
remove the old rules when the ports change.

## Slot status (session)

`Held { until, open }`:
- `open = false`: today's hold, kept for the same device.
- `open = true`: set by `restart_servers`; any device may take it. It expires like a hold.

## Addresses (unchanged)

`secure_port` and `plain_port` reflect the running servers after any restart. The snapshot
reads them on every refresh.
