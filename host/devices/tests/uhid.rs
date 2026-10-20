//! UHID backend against the real kernel (Linux with access to /dev/uhid; CI grants it). Skips
//! when the access is missing, and skips the evdev checks when the kernel lacks hid-playstation.
#![cfg(target_os = "linux")]

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant};

use ninjoy_devices::ds4::Ds4Pad;
use ninjoy_devices::{Backend, uhid};
use ninjoy_session::state::{Motion, button};
use ninjoy_session::{ControllerState, Feedback};

const SLOT: u16 = 41;

fn until<T>(what: &str, mut find: impl FnMut() -> Option<T>) -> T {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(found) = find() {
            return found;
        }
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// The hidraw node of our pad.
fn hidraw() -> Option<PathBuf> {
    fs::read_dir("/sys/class/hidraw")
        .ok()?
        .flatten()
        .find_map(|e| {
            let uevent = fs::read_to_string(e.path().join("device/uevent")).ok()?;
            uevent
                .contains(&format!("HID_PHYS=ninjoy/slot-{SLOT}"))
                .then(|| PathBuf::from("/dev").join(e.file_name()))
        })
}

/// The evdev node of our pad's input device named `name`.
fn event_device(name: &str) -> Option<PathBuf> {
    fs::read_dir("/sys/class/input")
        .ok()?
        .flatten()
        .find_map(|e| {
            let file = e.file_name().into_string().ok()?;
            let dir = e.path().join("device");
            let ok = file.starts_with("event")
                && fs::read_to_string(dir.join("phys")).ok()?.trim()
                    == format!("ninjoy/slot-{SLOT}")
                && fs::read_to_string(dir.join("name")).ok()?.trim() == name;
            ok.then(|| PathBuf::from("/dev/input").join(file))
        })
}

/// Reads (type, code, value) input events from an evdev node on a thread.
fn events(path: PathBuf) -> mpsc::Receiver<(u16, u16, i32)> {
    let (tx, rx) = mpsc::channel();
    let mut file = fs::File::open(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    std::thread::spawn(move || {
        let mut e = [0u8; 24];
        while file.read_exact(&mut e).is_ok() {
            let kind = u16::from_ne_bytes([e[16], e[17]]);
            let code = u16::from_ne_bytes([e[18], e[19]]);
            let value = i32::from_ne_bytes([e[20], e[21], e[22], e[23]]);
            if tx.send((kind, code, value)).is_err() {
                return;
            }
        }
    });
    rx
}

unsafe extern "C" {
    fn ioctl(fd: i32, request: u64, ...) -> i32;
}

/// `HIDIOCGFEATURE(len)`: asks the device (our UHID reader) for feature report `id`.
fn get_feature(hidraw: &fs::File, id: u8, len: usize) -> Vec<u8> {
    use std::os::fd::AsRawFd;
    let mut buf = vec![0u8; len];
    buf[0] = id;
    let request = (3u64 << 30) | ((len as u64) << 16) | (u64::from(b'H') << 8) | 0x07;
    // SAFETY: the buffer is `len` bytes long, as the request says
    let n = unsafe { ioctl(hidraw.as_raw_fd(), request, buf.as_mut_ptr()) };
    assert_eq!(n, len as i32, "feature report {id:#04x}");
    buf
}

fn expect_event(rx: &mpsc::Receiver<(u16, u16, i32)>, want: (u16, u16, i32), what: &str) {
    let deadline = Instant::now() + Duration::from_secs(3);
    while let Ok(got) = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
        if got == want {
            return;
        }
    }
    panic!("no {what} event {want:?}");
}

#[test]
fn the_kernel_sees_a_dualshock_4() {
    let backend = match uhid::open() {
        Ok(b) => b,
        Err(why) => {
            eprintln!("skipped: {why}");
            return;
        }
    };
    let (tx, feedback) = mpsc::channel::<Feedback>();
    let tx = std::sync::Mutex::new(tx);
    let mut pad = backend
        .plug(
            SLOT,
            Arc::new(move |f| {
                let _ = tx.lock().unwrap().send(f);
            }),
        )
        .expect("pad plugged");
    let mut ds4 = Ds4Pad::new();
    pad.submit(&ds4.report(&ControllerState::NEUTRAL, 0))
        .expect("report accepted");

    let raw = until("the pad's hidraw node", hidraw);

    // the game's rumble, written to the pad like Steam does, comes back as feedback
    let mut out = [0u8; 32];
    out[0] = 0x05;
    out[1] = 0x01;
    out[4] = 10;
    out[5] = 200;
    OpenOptions::new()
        .write(true)
        .open(&raw)
        .expect("hidraw opens")
        .write_all(&out)
        .expect("output written");
    let deadline = Instant::now() + Duration::from_secs(3);
    let rumble = loop {
        let f = feedback
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .expect("rumble feedback");
        if let Some(r) = f.rumble.filter(|&(strong, _)| strong > 0.5) {
            break r;
        }
    };
    assert_eq!(rumble, (200.0 / 255.0, 10.0 / 255.0));

    // feature reports, read through hidraw like Steam and the kernel driver do
    let hidraw = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&raw)
        .expect("hidraw opens");
    let calibration = get_feature(&hidraw, 0x02, 37);
    assert_eq!(
        calibration,
        ninjoy_devices::ds4::feature_report(0x02, SLOT).unwrap()
    );
    let pairing = get_feature(&hidraw, 0x12, 16);
    assert_eq!(
        pairing,
        ninjoy_devices::ds4::feature_report(0x12, SLOT).unwrap()
    );

    let gamepad = "Sony Interactive Entertainment Wireless Controller";
    let Some(pad_events) = (0..100).find_map(|_| {
        std::thread::sleep(Duration::from_millis(20));
        event_device(gamepad)
    }) else {
        eprintln!("hid-playstation did not bind (kernel without it); evdev checks skipped");
        return;
    };
    let buttons = events(pad_events);
    let motion = events(until("the motion sensors", || {
        event_device(&format!("{gamepad} Motion Sensors"))
    }));
    until("the touchpad", || {
        event_device(&format!("{gamepad} Touchpad"))
    });

    let pressed = ControllerState {
        buttons: 1 << button::CROSS,
        gyro: true,
        motion: Some(Motion {
            rate: [10.0, 0.0, 0.0],
            accel: [0.0, 9.80665, 0.0],
        }),
        ..ControllerState::NEUTRAL
    };
    pad.submit(&ds4.report(&pressed, 4_000))
        .expect("report accepted");
    expect_event(&buttons, (0x01, 0x130, 1), "cross (BTN_SOUTH)");
    // 16 raw per °/s, scaled by our calibration to the kernel's 1024 per °/s
    expect_event(&motion, (0x03, 0x03, 10 * 1024), "gyro pitch (ABS_RX)");
    drop(pad);
}
