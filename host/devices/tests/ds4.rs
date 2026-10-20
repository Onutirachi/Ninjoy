//! DualShock 4 report encoding (research R1/R2).

use ninjoy_devices::ds4::{self, Ds4Pad};
use ninjoy_session::state::{Motion, Touch, button as b};
use ninjoy_session::{ControllerState, Feedback};

fn state() -> ControllerState {
    ControllerState::NEUTRAL
}

fn press(bits: &[u32]) -> ControllerState {
    let mut s = state();
    for bit in bits {
        s.buttons |= 1 << bit;
    }
    s
}

fn i16_at(r: &[u8], at: usize) -> i16 {
    i16::from_le_bytes([r[at], r[at + 1]])
}

#[test]
fn neutral_report() {
    let r = Ds4Pad::new().report(&state(), 0);
    assert_eq!(r.len(), 64);
    assert_eq!(r[0], 0x01, "report id");
    assert_eq!(&r[1..5], &[128, 128, 128, 128], "sticks centered");
    assert_eq!(r[5], 0x08, "d-pad neutral, no face buttons");
    assert_eq!(r[6], 0);
    assert_eq!(r[7] & 0b11, 0);
    assert_eq!(&r[8..10], &[0, 0], "triggers");
    assert_eq!(
        [i16_at(&r, 13), i16_at(&r, 15), i16_at(&r, 17)],
        [0, 0, 0],
        "no rotation"
    );
    assert_eq!(
        [i16_at(&r, 19), i16_at(&r, 21), i16_at(&r, 23)],
        [0, 8192, 0],
        "lying flat at rest"
    );
    assert_eq!(r[30], 0x1b, "cable connected, full");
    assert_eq!(r[33], 1, "one touch packet");
    assert_eq!(r[35] & 0x80, 0x80, "finger 1 up");
    assert_eq!(r[39] & 0x80, 0x80, "finger 2 up");
}

#[test]
fn face_shoulder_and_system_buttons() {
    let mut pad = Ds4Pad::new();
    let r = pad.report(&press(&[b::SQUARE, b::CROSS, b::CIRCLE, b::TRIANGLE]), 0);
    assert_eq!(r[5], 0xF8);
    let r = pad.report(
        &press(&[
            b::L1,
            b::R1,
            b::L2,
            b::R2,
            b::SHARE,
            b::OPTIONS,
            b::L3,
            b::R3,
        ]),
        0,
    );
    assert_eq!(r[6], 0xFF);
    let r = pad.report(&press(&[b::PS, b::TOUCHPAD]), 0);
    assert_eq!(r[7] & 0b11, 0b11);
}

#[test]
fn dpad_directions() {
    let mut pad = Ds4Pad::new();
    let cases: [(&[u32], u8); 9] = [
        (&[b::UP], 0),
        (&[b::UP, b::RIGHT], 1),
        (&[b::RIGHT], 2),
        (&[b::DOWN, b::RIGHT], 3),
        (&[b::DOWN], 4),
        (&[b::DOWN, b::LEFT], 5),
        (&[b::LEFT], 6),
        (&[b::UP, b::LEFT], 7),
        (&[b::UP, b::DOWN], 8), // opposite directions cancel
    ];
    for (bits, want) in cases {
        assert_eq!(pad.report(&press(bits), 0)[5] & 0x0F, want, "{bits:?}");
    }
}

#[test]
fn sticks_and_triggers() {
    let mut s = state();
    s.sticks = [-32767, 32767, 16384, -16384];
    s.triggers = [255, 100];
    let r = Ds4Pad::new().report(&s, 0);
    assert_eq!(&r[1..5], &[1, 255, 191, 65]);
    assert_eq!(&r[8..10], &[255, 100]);
}

#[test]
fn counter_and_timestamp_advance_like_hardware() {
    let mut pad = Ds4Pad::new();
    let counters: Vec<u8> = (0..70).map(|_| pad.report(&state(), 0)[7] >> 2).collect();
    assert_eq!(&counters[..3], &[1, 2, 3]);
    assert_eq!(counters[62], 63);
    assert_eq!(counters[63], 0, "6-bit counter wraps");
    // 5.33 µs ticks: 4 ms later the timestamp advanced by 750
    let a = pad.report(&state(), 1_000_000);
    let b = pad.report(&state(), 1_004_000);
    let ts = |r: &[u8]| u16::from_le_bytes([r[10], r[11]]);
    assert_eq!(ts(&b).wrapping_sub(ts(&a)), 750);
}

#[test]
fn motion_maps_one_to_one_in_ds4_units() {
    let mut s = state();
    s.gyro = true;
    s.motion = Some(Motion {
        rate: [10.0, -20.0, 30.0],
        accel: [0.0, 9.80665, -4.903325],
    });
    let r = Ds4Pad::new().report(&s, 0);
    assert_eq!(
        [i16_at(&r, 13), i16_at(&r, 15), i16_at(&r, 17)],
        [160, -320, 480],
        "16 per °/s"
    );
    assert_eq!(
        [i16_at(&r, 19), i16_at(&r, 21), i16_at(&r, 23)],
        [0, 8192, -4096],
        "8192 per g"
    );
}

#[test]
fn motion_saturates_instead_of_wrapping() {
    let mut s = state();
    s.motion = Some(Motion {
        rate: [5000.0, -5000.0, 0.0],
        accel: [0.0; 3],
    });
    let r = Ds4Pad::new().report(&s, 0);
    assert_eq!([i16_at(&r, 13), i16_at(&r, 15)], [i16::MAX, i16::MIN]);
}

#[test]
fn touches_with_positions_and_tracking_ids() {
    let mut s = state();
    s.touches = [
        Some(Touch {
            id: 5,
            x: 65535,
            y: 0,
        }),
        Some(Touch {
            id: 9,
            x: 0,
            y: 65535,
        }),
    ];
    let mut pad = Ds4Pad::new();
    let r = pad.report(&s, 0);
    let point = |at: usize| {
        (
            r[at] & 0x7F,
            r[at] & 0x80 != 0,
            u16::from(r[at + 1]) | (u16::from(r[at + 2] & 0x0F) << 8),
            (u16::from(r[at + 2]) >> 4) | (u16::from(r[at + 3]) << 4),
        )
    };
    assert_eq!(point(35), (5, false, 1919, 0));
    assert_eq!(point(39), (9, false, 0, 942));
    let next = pad.report(&s, 0);
    assert_eq!(
        next[34],
        r[34].wrapping_add(1),
        "touch packet counter advances"
    );
    // lifted: up flag with the last tracking id
    let r = pad.report(&state(), 0);
    assert_eq!(r[35], 0x80 | 5);
    assert_eq!(r[39], 0x80 | 9);
}

#[test]
fn output_report_gives_rumble_and_lightbar() {
    let mut out = [0u8; 32];
    out[0] = 0x05;
    out[1] = 0x03;
    out[4] = 51; // weak (right) motor
    out[5] = 255; // strong (left) motor
    out[6..9].copy_from_slice(&[10, 20, 30]);
    assert_eq!(
        ds4::parse_output(&out),
        Some(Feedback {
            rumble: Some((1.0, 0.2)),
            lightbar: Some([10, 20, 30])
        })
    );
    out[1] = 0x02;
    assert_eq!(
        ds4::parse_output(&out),
        Some(Feedback {
            rumble: None,
            lightbar: Some([10, 20, 30])
        })
    );
    assert_eq!(
        ds4::parse_output(&[0x11, 0]),
        None,
        "not an output report we know"
    );
}

#[test]
fn feature_reports_have_the_kernel_sizes_and_exact_calibration() {
    let cal = ds4::feature_report(0x02, 7).unwrap();
    assert_eq!((cal.len(), cal[0]), (37, 0x02));
    let w = |at: usize| i16_at(&cal, at);
    assert_eq!([w(1), w(3), w(5)], [0, 0, 0], "gyro biases");
    assert_eq!(
        [w(7), w(9), w(11), w(13), w(15), w(17)],
        [8640, 8640, 8640, -8640, -8640, -8640],
        "USB order: pluses then minuses"
    );
    assert_eq!([w(19), w(21)], [540, 540], "gyro speed");
    assert_eq!(
        [w(23), w(25), w(27), w(29), w(31), w(33)],
        [8192, -8192, 8192, -8192, 8192, -8192]
    );
    let pairing = ds4::feature_report(0x12, 7).unwrap();
    assert_eq!((pairing.len(), pairing[0]), (16, 0x12));
    assert_ne!(
        pairing[1..7],
        ds4::feature_report(0x12, 8).unwrap()[1..7],
        "one MAC per slot"
    );
    let firmware = ds4::feature_report(0xa3, 7).unwrap();
    assert_eq!((firmware.len(), firmware[0]), (49, 0xa3));
    assert_eq!(ds4::feature_report(0x81, 7), None);
}
