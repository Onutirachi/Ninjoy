# Quickstart: validating the Linux setup and the Ports setting

## Automated

```bash
cargo test --workspace     # ports validation, script generation, sysctl/ufw parsing,
                           # open hold, server restart, hub set_backend, channel
npm test --workspace @ninjoy/desktop   # status panel, Configure outcomes, Ports, notice
```

## Linux PC (CachyOS test machine, KDE Wayland, ufw)

Prerequisite: undo the manual fixes of the earlier phase:
- remove `/etc/udev/rules.d/72-ninjoy-touchpad.rules`;
- reboot, so the `chmod 666 /dev/uhid` is gone.

Then build and start the app (README).

1. **Missing items**: the chip warns. The panel lists controllers, touchpad, ports and firewall
   (if ufw is enabled), each with an explanation and one Configure button.
2. **Cancel**: press Configure and dismiss the prompt. The panel says it was cancelled, and the
   items are still missing.
3. **Configure**: press it and type the password once.
   - Every item turns done.
   - The chip turns ok.
   - The addresses change to `ninjoy.local` with no port, and the moved notice shows.
4. **Controllers without a restart**: a phone that was already on a controller appears to Steam
   as a DS4.
5. **Touchpad**: slide on the phone's touchpad. The desktop pointer stays still, and Steam Input
   still reports the touchpad.
6. **Reboot**: the app starts with everything done, with no prompt, and phones play.
7. **No prompt**: run the app from an SSH session (no polkit agent) and press Configure. The
   panel shows the `sudo` commands to copy.
8. **Rule removed by hand**: delete `/etc/udev/rules.d/72-ninjoy-touchpad.rules` and reopen the
   panel. The touchpad item is missing again.

## Ports (Windows and Linux)

1. Set Custom to 9443 / 9080 while a phone plays.
   - The notice shows.
   - The addresses and QR codes change.
   - The game keeps the controller (no unplug sound or event).
   - Scanning the QR code gives the phone the same number.
2. Enter 70000, or the same port twice. The reason shows, and the session is untouched.
3. Start another server on 9443 (`python -m http.server 9443`) and choose it. The app names the
   port, keeps the previous ports and keeps the previous setting.
4. On Linux, with a custom port below 1024 and no port permission: the save fails with
   "permission denied", and the panel lists the ports item.

## Single copy

Start the app, then start it again (10 times on each system). The first window comes forward
and only one process runs. Kill the app (`kill -9`) and start it: it starts normally.
