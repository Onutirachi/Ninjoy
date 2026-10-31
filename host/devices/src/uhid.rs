//! Linux backend: one UHID device per pad (`/dev/uhid`, no driver install). The kernel's
//! `hid-playstation` driver (Linux 6.2+) binds it as a DualShock 4; Steam reads its hidraw node.
//! Event layouts from `linux/uhid.h` (research R2).

use std::fs::{File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::sync::Arc;

use crate::backend::{Backend, DeviceError, OnFeedback, Pad, Unavailable};
use crate::ds4::{self, Report};

pub const PATH: &str = "/dev/uhid";

/// Whether this process may create UHID devices now (the setup check).
pub fn can_open() -> bool {
    OpenOptions::new().read(true).write(true).open(PATH).is_ok()
}

const UHID_DESTROY: u32 = 1;
const UHID_STOP: u32 = 3;
const UHID_OUTPUT: u32 = 6;
const UHID_GET_REPORT: u32 = 9;
const UHID_GET_REPORT_REPLY: u32 = 10;
const UHID_CREATE2: u32 = 11;
const UHID_INPUT2: u32 = 12;
const UHID_SET_REPORT: u32 = 13;
const UHID_SET_REPORT_REPLY: u32 = 14;
/// `sizeof(struct uhid_event)`: the type and the largest request (create2).
const EVENT_SIZE: usize = 4 + 128 + 64 + 64 + 2 + 2 + 4 * 4 + 4096;
const DATA_MAX: usize = 4096;
const BUS_USB: u16 = 3;
const SONY: u32 = 0x054C;
const DS4_V1: u32 = 0x05C4;
const EIO: u16 = 5;

/// Vendor-defined report descriptor with the DS4's report ids and sizes (input 0x01, output
/// 0x05, features 0x02, 0x12, 0xa3); drivers read the reports by offset.
const DESCRIPTOR: &[u8] = &[
    0x05, 0x01, 0x09, 0x05, 0xA1, 0x01, // generic desktop, game pad, application
    0x06, 0x00, 0xFF, 0x15, 0x00, 0x26, 0xFF, 0x00, 0x75, 0x08, // vendor page, 0..255 bytes
    0x85, 0x01, 0x09, 0x20, 0x95, 0x3F, 0x81, 0x02, // input 0x01: 63 bytes
    0x85, 0x05, 0x09, 0x21, 0x95, 0x1F, 0x91, 0x02, // output 0x05: 31 bytes
    0x85, 0x02, 0x09, 0x24, 0x95, 0x24, 0xB1, 0x02, // feature 0x02 (calibration): 36 bytes
    0x85, 0x12, 0x09, 0x25, 0x95, 0x0F, 0xB1, 0x02, // feature 0x12 (pairing info): 15 bytes
    0x85, 0xA3, 0x09, 0x26, 0x95, 0x30, 0xB1, 0x02, // feature 0xa3 (firmware): 48 bytes
    0xC0,
];

pub struct UhidBackend;

/// Checks this process may create UHID devices.
pub fn open() -> Result<UhidBackend, Unavailable> {
    match OpenOptions::new().read(true).write(true).open(PATH) {
        Ok(_) => Ok(UhidBackend),
        Err(e) if e.kind() == ErrorKind::PermissionDenied => Err(Unavailable {
            reason: format!("No permission to create virtual controllers ({PATH})"),
            fix: "Press Configure in the virtual controller status.".into(),
        }),
        Err(e) => Err(Unavailable {
            reason: format!("{PATH} is not available ({e})"),
            fix: "Press Configure in the virtual controller status; it loads the kernel's UHID support."
                .into(),
        }),
    }
}

impl Backend for UhidBackend {
    fn name(&self) -> &'static str {
        "UHID"
    }

    fn plug(&self, slot: u16, feedback: OnFeedback) -> Result<Box<dyn Pad>, DeviceError> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(PATH)
            .map_err(|e| DeviceError(format!("{PATH}: {e}")))?;
        let file = Arc::new(file);
        write_event(&file, &create2(slot))?;
        let reader = file.clone();
        std::thread::Builder::new()
            .name(format!("ninjoy-pad-{slot}-uhid"))
            .spawn(move || serve(&reader, slot, &feedback))
            .map_err(|e| DeviceError(format!("UHID reader thread: {e}")))?;
        Ok(Box::new(UhidPad {
            file,
            input: [0; 4 + 2 + ds4::REPORT_LEN],
        }))
    }
}

struct UhidPad {
    file: Arc<File>,
    input: [u8; 4 + 2 + ds4::REPORT_LEN],
}

impl Pad for UhidPad {
    fn submit(&mut self, report: &Report) -> Result<(), DeviceError> {
        self.input[..4].copy_from_slice(&UHID_INPUT2.to_ne_bytes());
        self.input[4..6].copy_from_slice(&(ds4::REPORT_LEN as u16).to_ne_bytes());
        self.input[6..].copy_from_slice(report);
        write_event(&self.file, &self.input)
    }
}

impl Drop for UhidPad {
    fn drop(&mut self) {
        // the kernel then sends UHID_STOP, which ends the reader thread
        let _ = write_event(&self.file, &UHID_DESTROY.to_ne_bytes());
    }
}

fn write_event(mut file: &File, bytes: &[u8]) -> Result<(), DeviceError> {
    file.write_all(bytes)
        .map_err(|e| DeviceError(format!("{PATH}: {e}")))
}

fn put(buf: &mut [u8], at: usize, bytes: &[u8]) {
    buf[at..at + bytes.len()].copy_from_slice(bytes);
}

fn create2(slot: u16) -> Vec<u8> {
    let mut e = vec![0u8; EVENT_SIZE];
    put(&mut e, 0, &UHID_CREATE2.to_ne_bytes());
    put(
        &mut e,
        4,
        b"Sony Interactive Entertainment Wireless Controller",
    );
    put(&mut e, 4 + 128, format!("ninjoy/slot-{slot}").as_bytes());
    put(&mut e, 4 + 128 + 64, format!("ninjoy-{slot}").as_bytes());
    let at = 4 + 128 + 64 + 64;
    put(&mut e, at, &(DESCRIPTOR.len() as u16).to_ne_bytes());
    put(&mut e, at + 2, &BUS_USB.to_ne_bytes());
    put(&mut e, at + 4, &SONY.to_ne_bytes());
    put(&mut e, at + 8, &DS4_V1.to_ne_bytes());
    put(&mut e, at + 12, &0x0100u32.to_ne_bytes()); // version
    put(&mut e, at + 20, DESCRIPTOR); // after country
    e
}

/// Answers the kernel's requests for the pad's life: feature reports, output reports (rumble,
/// lightbar) and set-report acknowledgements; ends at UHID_STOP or when the device is gone.
fn serve(mut file: &File, slot: u16, feedback: &OnFeedback) {
    let mut e = vec![0u8; EVENT_SIZE];
    loop {
        match file.read(&mut e) {
            Ok(n) if n >= 4 => {}
            _ => return,
        }
        let kind = u32::from_ne_bytes([e[0], e[1], e[2], e[3]]);
        match kind {
            UHID_OUTPUT => {
                let size = usize::from(u16::from_ne_bytes([e[4 + DATA_MAX], e[5 + DATA_MAX]]))
                    .min(DATA_MAX);
                if let Some(f) = ds4::parse_output(&e[4..4 + size]) {
                    feedback(f);
                }
            }
            UHID_GET_REPORT => {
                let id = [e[4], e[5], e[6], e[7]];
                let data = ds4::feature_report(e[8], slot);
                let mut reply = vec![0u8; 4 + 4 + 2 + 2 + DATA_MAX];
                put(&mut reply, 0, &UHID_GET_REPORT_REPLY.to_ne_bytes());
                put(&mut reply, 4, &id);
                match &data {
                    Some(d) => {
                        put(&mut reply, 10, &(d.len() as u16).to_ne_bytes());
                        put(&mut reply, 12, d);
                    }
                    None => put(&mut reply, 8, &EIO.to_ne_bytes()),
                }
                if write_event(file, &reply).is_err() {
                    return;
                }
            }
            UHID_SET_REPORT => {
                let mut reply = [0u8; 4 + 4 + 2];
                put(&mut reply, 0, &UHID_SET_REPORT_REPLY.to_ne_bytes());
                put(&mut reply, 4, &e[4..8]);
                if write_event(file, &reply).is_err() {
                    return;
                }
            }
            UHID_STOP => return,
            _ => {}
        }
    }
}
