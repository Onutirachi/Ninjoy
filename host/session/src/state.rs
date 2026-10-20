//! The controller state a page sends: the DualShock 4 inputs plus motion.

/// Bit index of each DS4 button in [`ControllerState::buttons`] (same order as the page).
pub mod button {
    pub const CROSS: u32 = 0;
    pub const CIRCLE: u32 = 1;
    pub const SQUARE: u32 = 2;
    pub const TRIANGLE: u32 = 3;
    pub const UP: u32 = 4;
    pub const DOWN: u32 = 5;
    pub const LEFT: u32 = 6;
    pub const RIGHT: u32 = 7;
    pub const L1: u32 = 8;
    pub const R1: u32 = 9;
    pub const L2: u32 = 10;
    pub const R2: u32 = 11;
    pub const L3: u32 = 12;
    pub const R3: u32 = 13;
    pub const SHARE: u32 = 14;
    pub const OPTIONS: u32 = 15;
    pub const PS: u32 = 16;
    pub const TOUCHPAD: u32 = 17;
    /// Names in bit order, for logs and tools.
    pub const NAMES: [&str; 18] = [
        "cross", "circle", "square", "triangle", "up", "down", "left", "right", "l1", "r1", "l2",
        "r2", "l3", "r3", "share", "options", "ps", "touchpad",
    ];
}

/// One finger on the touchpad; coordinates span the whole DS4 touchpad (0…65535).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Touch {
    pub id: u8,
    pub x: u16,
    pub y: u16,
}

/// Device motion in the controller frame (x right, y up, z toward the player).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Motion {
    /// rotation rate, °/s
    pub rate: [f32; 3],
    /// acceleration including gravity, m/s²
    pub accel: [f32; 3],
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ControllerState {
    /// DS4 buttons, bit = index in [`button`]
    pub buttons: u32,
    /// left x, left y, right x, right y (−32767…32767; y positive = down)
    pub sticks: [i16; 4],
    /// L2, R2 force (0…255)
    pub triggers: [u8; 2],
    /// the player's gyro toggle
    pub gyro: bool,
    pub touches: [Option<Touch>; 2],
    /// present only while gyro is on
    pub motion: Option<Motion>,
}

impl ControllerState {
    /// Nothing pressed, sticks centered, no touches, no motion.
    pub const NEUTRAL: Self = Self {
        buttons: 0,
        sticks: [0; 4],
        triggers: [0; 2],
        gyro: false,
        touches: [None, None],
        motion: None,
    };

    /// Everything released, keeping only the gyro toggle (used on loss, hidden page, kick).
    pub fn released(&self) -> Self {
        Self {
            gyro: self.gyro,
            ..Self::NEUTRAL
        }
    }

    pub fn pressed(&self, bit: u32) -> bool {
        self.buttons & (1 << bit) != 0
    }

    pub fn touchpad_click(&self) -> bool {
        self.pressed(button::TOUCHPAD)
    }
}
