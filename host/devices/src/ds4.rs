//! The DualShock 4 USB input report (0x01) built from a controller state, and the output and
//! feature reports the backends exchange with the driver. Layout in the spec's research R1.

use ninjoy_session::state::button as b;
use ninjoy_session::{ControllerState, Feedback};

pub const REPORT_LEN: usize = 64;
pub type Report = [u8; REPORT_LEN];

/// Raw gyroscope units per °/s and accelerometer units per g.
const GYRO_PER_DEG_S: f32 = 16.0;
const ACCEL_PER_G: f32 = 8192.0;
const G: f32 = 9.80665;
/// Touchpad resolution.
const TOUCH_MAX_X: u32 = 1919;
const TOUCH_MAX_Y: u32 = 942;

/// One virtual pad's clock: report counter, timestamp and touch tracking.
#[derive(Debug, Default)]
pub struct Ds4Pad {
    counter: u8,
    touch_packets: u8,
    /// last tracking id of each finger slot, kept while the finger is up
    tracking: [u8; 2],
}

impl Ds4Pad {
    pub fn new() -> Self {
        Self::default()
    }

    /// The input report for `state`; `now_us` is a monotonic time in µs (for the timestamp).
    /// Every call is one report sent: the counters advance.
    pub fn report(&mut self, state: &ControllerState, now_us: u64) -> Report {
        let mut r = [0u8; REPORT_LEN];
        r[0] = 0x01;
        for i in 0..4 {
            r[1 + i] = axis(state.sticks[i]);
        }

        let mut face = 0u8;
        for (bit, flag) in [
            (b::SQUARE, 0x10),
            (b::CROSS, 0x20),
            (b::CIRCLE, 0x40),
            (b::TRIANGLE, 0x80),
        ] {
            if state.pressed(bit) {
                face |= flag;
            }
        }
        r[5] = dpad(state) | face;
        for (i, bit) in [
            b::L1,
            b::R1,
            b::L2,
            b::R2,
            b::SHARE,
            b::OPTIONS,
            b::L3,
            b::R3,
        ]
        .into_iter()
        .enumerate()
        {
            if state.pressed(bit) {
                r[6] |= 1 << i;
            }
        }
        self.counter = (self.counter + 1) & 0x3F;
        r[7] = (self.counter << 2)
            | u8::from(state.pressed(b::PS))
            | (u8::from(state.pressed(b::TOUCHPAD)) << 1);
        r[8] = state.triggers[0];
        r[9] = state.triggers[1];
        // 5.33 µs ticks (3/16 of a µs count), wrapping like the hardware's 16-bit clock
        r[10..12].copy_from_slice(&((now_us * 3 / 16) as u16).to_le_bytes());
        r[12] = 0xFF;

        // the page's screen frame is the DS4 frame: a phone upright toward the player is a DS4 lying flat
        let (gyro, accel) = match state.motion {
            Some(m) => (
                m.rate.map(|v| saturate(v * GYRO_PER_DEG_S)),
                m.accel.map(|v| saturate(v / G * ACCEL_PER_G)),
            ),
            None => ([0; 3], [0, ACCEL_PER_G as i16, 0]),
        };
        for (i, v) in gyro.into_iter().chain(accel).enumerate() {
            r[13 + 2 * i..15 + 2 * i].copy_from_slice(&v.to_le_bytes());
        }
        r[30] = 0x1B; // cable connected, battery full

        r[33] = 1;
        self.touch_packets = self.touch_packets.wrapping_add(1);
        r[34] = self.touch_packets;
        for (i, touch) in state.touches.iter().enumerate() {
            let at = 35 + 4 * i;
            match touch {
                Some(t) => {
                    self.tracking[i] = t.id & 0x7F;
                    let x = u32::from(t.x) * TOUCH_MAX_X / 65535;
                    let y = u32::from(t.y) * TOUCH_MAX_Y / 65535;
                    r[at] = self.tracking[i];
                    r[at + 1] = x as u8;
                    r[at + 2] = ((x >> 8) & 0x0F) as u8 | ((y & 0x0F) << 4) as u8;
                    r[at + 3] = (y >> 4) as u8;
                }
                None => r[at] = 0x80 | self.tracking[i],
            }
        }
        r
    }
}

fn axis(v: i16) -> u8 {
    (i32::from(v) * 127 / 32767 + 128).clamp(0, 255) as u8
}

fn saturate(v: f32) -> i16 {
    v.round().clamp(f32::from(i16::MIN), f32::from(i16::MAX)) as i16
}

/// D-pad hat: 0 = up, clockwise to 7 = up-left, 8 = neutral; opposite directions cancel.
fn dpad(s: &ControllerState) -> u8 {
    let v = i8::from(s.pressed(b::DOWN)) - i8::from(s.pressed(b::UP));
    let h = i8::from(s.pressed(b::RIGHT)) - i8::from(s.pressed(b::LEFT));
    match (v, h) {
        (-1, 0) => 0,
        (-1, 1) => 1,
        (0, 1) => 2,
        (1, 1) => 3,
        (1, 0) => 4,
        (1, -1) => 5,
        (0, -1) => 6,
        (-1, -1) => 7,
        _ => 8,
    }
}

/// Rumble and lightbar from an output report 0x05 (USB); `None` for other reports.
pub fn parse_output(data: &[u8]) -> Option<Feedback> {
    if data.len() < 9 || data[0] != 0x05 {
        return None;
    }
    let flags = data[1];
    Some(Feedback {
        // strong (left) motor at 5, weak (right) at 4
        rumble: (flags & 0x01 != 0)
            .then(|| (f32::from(data[5]) / 255.0, f32::from(data[4]) / 255.0)),
        lightbar: (flags & 0x02 != 0).then(|| [data[6], data[7], data[8]]),
    })
}

/// The feature reports a driver asks for (calibration, pairing info, firmware), for the pad of
/// `slot`; `None` for reports a DS4 does not have.
pub fn feature_report(id: u8, slot: u16) -> Option<Vec<u8>> {
    match id {
        0x02 => {
            // exact scaling: 16 raw per °/s and 8192 raw per g (research R2)
            let words: [i16; 18] = [
                0, 0, 0, 8640, 8640, 8640, -8640, -8640, -8640, 540, 540, 8192, -8192, 8192, -8192,
                8192, -8192, 0,
            ];
            let mut r = vec![0x02];
            for w in words {
                r.extend_from_slice(&w.to_le_bytes());
            }
            Some(r)
        }
        0x12 => {
            let mut r = vec![0u8; 16];
            r[0] = 0x12;
            r[1..7].copy_from_slice(&mac(slot));
            Some(r)
        }
        0xa3 => {
            let mut r = vec![0u8; 49];
            r[0] = 0xa3;
            r[35..37].copy_from_slice(&0x0100u16.to_le_bytes()); // hardware version
            r[41..43].copy_from_slice(&0x0100u16.to_le_bytes()); // firmware version
            Some(r)
        }
        _ => None,
    }
}

/// A locally administered MAC per slot, stored least significant byte first like the DS4's;
/// drivers refuse two pads with the same address.
fn mac(slot: u16) -> [u8; 6] {
    let [hi, lo] = slot.to_be_bytes();
    [lo, hi, 0x00, 0x4A, 0x4E, 0x02]
}
