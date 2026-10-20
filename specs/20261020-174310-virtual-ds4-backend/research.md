# Research: Virtual DualShock 4 Backend

## R1 - One report model, two transports

- **Decision**: build one DualShock 4 USB input report (report 0x01, 64 bytes) from the controller
  state and a per-pad clock; the Linux backend writes those bytes to UHID, the Windows backend
  copies the same fields into ViGEm's extended DS4 report.
- **Rationale**: the byte layout is what Steam (hidraw/SDL) and the Linux kernel parse; one encoder
  unit-tested with byte vectors covers both platforms.
- **Alternatives**: per-backend mapping (the prototype's approach) — duplicates the mapping and
  the touch/counter bookkeeping.

USB report 0x01 layout used (offsets in bytes): 0 id, 1–4 sticks LX LY RX RY (0–255, 128 center,
Y down), 5 d-pad (low nibble, 8 = neutral) + square/cross/circle/triangle (bits 4–7), 6 L1 R1 L2
R2 share options L3 R3, 7 PS (bit 0), touchpad click (bit 1), counter (bits 2–7), 8–9 L2 R2
analog, 10–11 timestamp (5.33 µs ticks), 12 temperature, 13–18 gyro X Y Z (i16, 16 per °/s), 19–24
accel X Y Z (i16, 8192 per g), 30 battery/cable (0x1b = cable, full), 33 touch packet count, 34
packet counter, 35–38 touch 1 (bit 7 of 35 = up, low 7 = tracking id, 12-bit X 0–1919, 12-bit Y
0–942), 39–42 touch 2.

## R2 - Linux: UHID without a driver install

- **Decision**: open `/dev/uhid`, create the device with `UHID_CREATE2` (bus USB, VID 054C, PID
  05C4, name "Sony Interactive Entertainment Wireless Controller"), send input with `UHID_INPUT2`,
  answer `UHID_GET_REPORT` and read `UHID_OUTPUT` on a reader thread, `UHID_DESTROY` on unplug.
  The event structs are written as bytes (no new dependency).
- **Kernel driver**: `hid-playstation` (Linux 6.2+) binds by VID/PID and parses the raw report by
  offsets; it creates the gamepad, motion sensors and touchpad input devices. At probe it asks
  for feature reports 0x02 (calibration, 37 bytes), 0x12 (pairing info with the MAC, 16 bytes)
  and 0xa3 (firmware, 49 bytes); unanswered requests make probe fail, so the reader thread
  replies with fixed contents.
- **Calibration** chosen so the kernel scaling is exact for our raw units: gyro biases 0,
  pitch/yaw/roll plus = 8640 and minus = −8640, speed plus = minus = 540 (the kernel scales by
  speed_2x × 1024 / range = 64, i.e. 16 raw per °/s → 1024 per °/s); accelerometer plus = 8192,
  minus = −8192 per axis (bias 0, 8192 per g).
- **Report descriptor**: a vendor-defined descriptor declaring input 0x01 (63 bytes), output 0x05
  (31 bytes) and features 0x02/0x12/0xa3 with their sizes; `hid-playstation` and Steam read raw
  reports by offset, so a full DS4 descriptor is not needed.
- **Access**: `/dev/uhid` is root-only by default; the host prints the udev rule
  `KERNEL=="uhid", MODE="0660", TAG+="uaccess"`. Steam opens the pad's hidraw node through its
  own `steam-devices` rules, which match the kernel name `*054C:05C4*` on the USB bus.
- **Alternatives**: `uinput` (evdev only, no hidraw: Steam would not see a DS4 with gyro and
  touchpad); a crate wrapping UHID (adds a dependency for a few structs).

## R3 - Windows: ViGEmBus

- **Decision**: `vigem-rust` 0.2 (MIT/Apache-2.0), as in the prototype: one client, a DS4 target
  per pad, `update_ex` with the extended report, notifications for rumble and lightbar on a
  thread per pad. The driver missing shows up as a connect error at start.
- **Rationale**: validated in Steam with Counter-Strike and Overwatch.

## R4 - Steady 250 Hz

- **Decision**: one pump thread for all pads with deadline scheduling (next += 4 ms, sleep until
  it, skip missed ticks), resubmitting each pad's last report with a new counter and timestamp;
  `on_state` submits at once as well. Rust's `thread::sleep` uses high-resolution timers on
  Windows and Linux, enough for ±10 reports per second.
- **Alternatives**: a timer per pad (more threads, same result).

## R5 - Testing

- Encoder, output report parsing, feature reports and the hub (plug on create/first state,
  unplug on free, failure isolation, pump rate, latency) are tested on every platform with a
  recording test backend.
- Linux: an integration test creates a real UHID pad (CI runs it with `sudo` access to
  `/dev/uhid`) and checks the kernel exposes the gamepad, motion and touchpad devices and that a
  pressed button and a gyro value come out of evdev.
- Windows: an ignored integration test plugs a ViGEm pad when the driver is present (run locally).
