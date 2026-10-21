//! Wire protocol v1 between the controller page and the host (contracts/protocol.md).
//!
//! Little-endian, first byte = message type. Decoding reads straight from the frame into
//! plain values (no allocation except for the controller list).

use crate::state::{ControllerState, Motion, Touch};

pub const PROTOCOL_VERSION: u8 = 1;

/// Random identity a page keeps on its device.
pub type DeviceId = [u8; 16];

mod kind {
    pub const HELLO: u8 = 0x01;
    pub const STATE: u8 = 0x02;
    pub const HIDDEN: u8 = 0x03;
    pub const PONG: u8 = 0x04;
    pub const LIST: u8 = 0x05;
    pub const SKIN: u8 = 0x06;
    pub const WELCOME: u8 = 0x81;
    pub const IN_USE: u8 = 0x82;
    pub const OPENED_ELSEWHERE: u8 = 0x83;
    pub const KICKED: u8 = 0x84;
    pub const VERSION_MISMATCH: u8 = 0x85;
    pub const FEEDBACK: u8 = 0x86;
    pub const PING: u8 = 0x87;
    pub const SLOT_LIST: u8 = 0x88;
    pub const SKINS_CHANGED: u8 = 0x89;
}

const STATE_HEADER: usize = 21;
const TOUCH_SIZE: usize = 5;
const MOTION_SIZE: usize = 24;

/// Longest skin id (bytes) in a `Skin` message.
pub const MAX_SKIN_ID: usize = 64;

#[derive(Clone, Debug, PartialEq)]
pub enum PageMessage {
    /// `slot` 0 = new controller
    Hello {
        version: u8,
        slot: u16,
        device: DeviceId,
    },
    State {
        seq: u32,
        state: ControllerState,
    },
    Hidden,
    /// the controller list page; `device` lets it show the slot held for this device
    List {
        device: DeviceId,
    },
    Pong {
        nonce: u32,
    },
    /// the skin the page uses ("" = the host's default)
    Skin {
        id: String,
    },
}

/// Status of a slot as shown in the controller list.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ListStatus {
    Waiting = 0,
    Connected = 1,
    Held = 2,
    /// held for the device that asked for the list
    HeldForYou = 3,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ListEntry {
    pub slot: u16,
    pub status: ListStatus,
}

#[derive(Clone, Debug, PartialEq)]
pub enum HostMessage {
    Welcome {
        version: u8,
        slot: u16,
    },
    /// `requested` 0 = new controllers are not allowed
    InUse {
        requested: u16,
    },
    OpenedElsewhere,
    Kicked,
    VersionMismatch {
        host_version: u8,
    },
    Feedback {
        rumble: Option<[u8; 2]>,
        lightbar: Option<[u8; 3]>,
    },
    SlotList {
        phones_can_create: bool,
        entries: Vec<ListEntry>,
    },
    /// `last_rtt` in 0.1 ms units, 0 = unknown
    Ping {
        nonce: u32,
        last_rtt: u16,
    },
    /// the skin library or the default skin changed: the page asks again
    SkinsChanged,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecodeError {
    Empty,
    /// the length does not match the message type
    BadLength {
        kind: u8,
        len: usize,
    },
    /// a field holds a value the protocol does not allow
    BadValue {
        kind: u8,
    },
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "empty message"),
            Self::BadLength { kind, len } => {
                write!(f, "message 0x{kind:02x} has a wrong length ({len} bytes)")
            }
            Self::BadValue { kind } => write!(f, "message 0x{kind:02x} has an invalid field"),
        }
    }
}

impl std::error::Error for DecodeError {}

/// `true` when sequence `new` comes after `last`, allowing the counter to wrap around.
pub fn seq_is_newer(new: u32, last: u32) -> bool {
    (new.wrapping_sub(last) as i32) > 0
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl Reader<'_> {
    fn u8(&mut self) -> u8 {
        let v = self.bytes[self.at];
        self.at += 1;
        v
    }
    fn array<const N: usize>(&mut self) -> [u8; N] {
        let v: [u8; N] = self.bytes[self.at..self.at + N]
            .try_into()
            .expect("length checked");
        self.at += N;
        v
    }
    fn u16(&mut self) -> u16 {
        u16::from_le_bytes(self.array())
    }
    fn i16(&mut self) -> i16 {
        i16::from_le_bytes(self.array())
    }
    fn u32(&mut self) -> u32 {
        u32::from_le_bytes(self.array())
    }
    fn f32(&mut self) -> f32 {
        f32::from_le_bytes(self.array())
    }
}

fn expect_len(bytes: &[u8], len: usize) -> Result<(), DecodeError> {
    if bytes.len() == len {
        Ok(())
    } else {
        Err(DecodeError::BadLength {
            kind: bytes[0],
            len: bytes.len(),
        })
    }
}

/// Decodes a message sent by a page. `Ok(None)` for unknown types (ignored).
pub fn decode_page(bytes: &[u8]) -> Result<Option<PageMessage>, DecodeError> {
    let Some(&kind) = bytes.first() else {
        return Err(DecodeError::Empty);
    };
    let mut r = Reader { bytes, at: 1 };
    let message = match kind {
        kind::HELLO => {
            expect_len(bytes, 20)?;
            PageMessage::Hello {
                version: r.u8(),
                slot: r.u16(),
                device: r.array(),
            }
        }
        kind::STATE => {
            if bytes.len() < STATE_HEADER {
                return Err(DecodeError::BadLength {
                    kind,
                    len: bytes.len(),
                });
            }
            let seq = r.u32();
            let buttons = r.u32();
            let sticks = [r.i16(), r.i16(), r.i16(), r.i16()];
            let triggers = [r.u8(), r.u8()];
            let flags = r.u8();
            r.u8(); // reserved
            let touch_count = ((flags >> 2) & 0b11) as usize;
            let has_motion = flags & 0b10 != 0;
            if touch_count > 2 {
                return Err(DecodeError::BadValue { kind });
            }
            expect_len(
                bytes,
                STATE_HEADER + touch_count * TOUCH_SIZE + if has_motion { MOTION_SIZE } else { 0 },
            )?;
            let mut touches = [None, None];
            for touch in touches.iter_mut().take(touch_count) {
                *touch = Some(Touch {
                    id: r.u8(),
                    x: r.u16(),
                    y: r.u16(),
                });
            }
            let motion = has_motion.then(|| Motion {
                rate: [r.f32(), r.f32(), r.f32()],
                accel: [r.f32(), r.f32(), r.f32()],
            });
            let state = ControllerState {
                buttons,
                sticks,
                triggers,
                gyro: flags & 1 != 0,
                touches,
                motion,
            };
            PageMessage::State { seq, state }
        }
        kind::HIDDEN => {
            expect_len(bytes, 1)?;
            PageMessage::Hidden
        }
        kind::LIST => {
            expect_len(bytes, 17)?;
            PageMessage::List { device: r.array() }
        }
        kind::PONG => {
            expect_len(bytes, 5)?;
            PageMessage::Pong { nonce: r.u32() }
        }
        kind::SKIN => {
            let len = *bytes.get(1).ok_or(DecodeError::BadLength {
                kind,
                len: bytes.len(),
            })? as usize;
            if len > MAX_SKIN_ID {
                return Err(DecodeError::BadValue { kind });
            }
            expect_len(bytes, 2 + len)?;
            let id =
                std::str::from_utf8(&bytes[2..]).map_err(|_| DecodeError::BadValue { kind })?;
            PageMessage::Skin { id: id.to_owned() }
        }
        _ => return Ok(None),
    };
    Ok(Some(message))
}

/// Encodes a page message (used by tests and tools; the page has its own codec).
pub fn encode_page(message: &PageMessage, out: &mut Vec<u8>) {
    out.clear();
    match message {
        PageMessage::Hello {
            version,
            slot,
            device,
        } => {
            out.extend_from_slice(&[kind::HELLO, *version]);
            out.extend_from_slice(&slot.to_le_bytes());
            out.extend_from_slice(device);
        }
        PageMessage::State { seq, state } => {
            let touches = state.touches.iter().flatten().count() as u8;
            let flags = state.gyro as u8 | (state.motion.is_some() as u8) << 1 | touches << 2;
            out.push(kind::STATE);
            out.extend_from_slice(&seq.to_le_bytes());
            out.extend_from_slice(&state.buttons.to_le_bytes());
            for v in state.sticks {
                out.extend_from_slice(&v.to_le_bytes());
            }
            out.extend_from_slice(&[state.triggers[0], state.triggers[1], flags, 0]);
            for t in state.touches.iter().flatten() {
                out.push(t.id);
                out.extend_from_slice(&t.x.to_le_bytes());
                out.extend_from_slice(&t.y.to_le_bytes());
            }
            if let Some(m) = state.motion {
                for v in m.rate.iter().chain(&m.accel) {
                    out.extend_from_slice(&v.to_le_bytes());
                }
            }
        }
        PageMessage::Hidden => out.push(kind::HIDDEN),
        PageMessage::List { device } => {
            out.push(kind::LIST);
            out.extend_from_slice(device);
        }
        PageMessage::Pong { nonce } => {
            out.push(kind::PONG);
            out.extend_from_slice(&nonce.to_le_bytes());
        }
        PageMessage::Skin { id } => {
            let id = &id.as_bytes()[..id.len().min(MAX_SKIN_ID)];
            out.extend_from_slice(&[kind::SKIN, id.len() as u8]);
            out.extend_from_slice(id);
        }
    }
}

/// Encodes a host message into `out` (cleared first, so one buffer can be reused).
pub fn encode_host(message: &HostMessage, out: &mut Vec<u8>) {
    out.clear();
    match message {
        HostMessage::Welcome { version, slot } => {
            out.extend_from_slice(&[kind::WELCOME, *version]);
            out.extend_from_slice(&slot.to_le_bytes());
        }
        HostMessage::InUse { requested } => {
            out.push(kind::IN_USE);
            out.extend_from_slice(&requested.to_le_bytes());
        }
        HostMessage::OpenedElsewhere => out.push(kind::OPENED_ELSEWHERE),
        HostMessage::Kicked => out.push(kind::KICKED),
        HostMessage::VersionMismatch { host_version } => {
            out.extend_from_slice(&[kind::VERSION_MISMATCH, *host_version])
        }
        HostMessage::Feedback { rumble, lightbar } => {
            let flags = rumble.is_some() as u8 | (lightbar.is_some() as u8) << 1;
            let [strong, weak] = rumble.unwrap_or_default();
            let [r, g, b] = lightbar.unwrap_or_default();
            out.extend_from_slice(&[kind::FEEDBACK, flags, strong, weak, r, g, b]);
        }
        HostMessage::SlotList {
            phones_can_create,
            entries,
        } => {
            let shown = &entries[..entries.len().min(255)];
            out.extend_from_slice(&[kind::SLOT_LIST, *phones_can_create as u8, shown.len() as u8]);
            for e in shown {
                out.extend_from_slice(&e.slot.to_le_bytes());
                out.push(e.status as u8);
            }
        }
        HostMessage::Ping { nonce, last_rtt } => {
            out.push(kind::PING);
            out.extend_from_slice(&nonce.to_le_bytes());
            out.extend_from_slice(&last_rtt.to_le_bytes());
        }
        HostMessage::SkinsChanged => out.push(kind::SKINS_CHANGED),
    }
}

/// Decodes a host message (used by tests and tools; the page has its own codec).
pub fn decode_host(bytes: &[u8]) -> Result<Option<HostMessage>, DecodeError> {
    let Some(&kind) = bytes.first() else {
        return Err(DecodeError::Empty);
    };
    let mut r = Reader { bytes, at: 1 };
    let message = match kind {
        kind::WELCOME => {
            expect_len(bytes, 4)?;
            HostMessage::Welcome {
                version: r.u8(),
                slot: r.u16(),
            }
        }
        kind::IN_USE => {
            expect_len(bytes, 3)?;
            HostMessage::InUse { requested: r.u16() }
        }
        kind::OPENED_ELSEWHERE => {
            expect_len(bytes, 1)?;
            HostMessage::OpenedElsewhere
        }
        kind::KICKED => {
            expect_len(bytes, 1)?;
            HostMessage::Kicked
        }
        kind::VERSION_MISMATCH => {
            expect_len(bytes, 2)?;
            HostMessage::VersionMismatch {
                host_version: r.u8(),
            }
        }
        kind::FEEDBACK => {
            expect_len(bytes, 7)?;
            let flags = r.u8();
            let rumble = [r.u8(), r.u8()];
            let lightbar = [r.u8(), r.u8(), r.u8()];
            HostMessage::Feedback {
                rumble: (flags & 1 != 0).then_some(rumble),
                lightbar: (flags & 2 != 0).then_some(lightbar),
            }
        }
        kind::SLOT_LIST => {
            if bytes.len() < 3 {
                return Err(DecodeError::BadLength {
                    kind,
                    len: bytes.len(),
                });
            }
            let phones_can_create = r.u8() & 1 != 0;
            let n = r.u8() as usize;
            expect_len(bytes, 3 + 3 * n)?;
            let mut entries = Vec::with_capacity(n);
            for _ in 0..n {
                let slot = r.u16();
                let status = match r.u8() {
                    0 => ListStatus::Waiting,
                    1 => ListStatus::Connected,
                    2 => ListStatus::Held,
                    3 => ListStatus::HeldForYou,
                    _ => return Err(DecodeError::BadValue { kind }),
                };
                entries.push(ListEntry { slot, status });
            }
            HostMessage::SlotList {
                phones_can_create,
                entries,
            }
        }
        kind::PING => {
            expect_len(bytes, 7)?;
            HostMessage::Ping {
                nonce: r.u32(),
                last_rtt: r.u16(),
            }
        }
        kind::SKINS_CHANGED => {
            expect_len(bytes, 1)?;
            HostMessage::SkinsChanged
        }
        _ => return Ok(None),
    };
    Ok(Some(message))
}
