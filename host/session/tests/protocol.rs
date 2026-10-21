//! The Rust codec against the shared vectors (also read by the page's codec tests).

use ninjoy_session::protocol::{
    DecodeError, HostMessage, ListEntry, ListStatus, PageMessage, decode_host, decode_page,
    encode_host, encode_page, seq_is_newer,
};
use ninjoy_session::state::{ControllerState, Motion, Touch};
use serde_json::Value;

fn vectors() -> Value {
    serde_json::from_str(include_str!("vectors.json")).expect("vectors.json is valid JSON")
}

fn hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

fn num<T: TryFrom<u64>>(v: &Value) -> T {
    T::try_from(v.as_u64().expect("number")).ok().expect("fits")
}

fn page_message(m: &Value) -> PageMessage {
    match m["type"].as_str().unwrap() {
        "hello" => PageMessage::Hello {
            version: num(&m["version"]),
            slot: num(&m["slot"]),
            device: hex(m["device"].as_str().unwrap()).try_into().unwrap(),
        },
        "state" => {
            let sticks: Vec<i16> = m["sticks"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_i64().unwrap() as i16)
                .collect();
            let mut touches = [None, None];
            for (slot, t) in touches.iter_mut().zip(m["touches"].as_array().unwrap()) {
                *slot = Some(Touch {
                    id: num(&t["id"]),
                    x: num(&t["x"]),
                    y: num(&t["y"]),
                });
            }
            let floats = |v: &Value| -> [f32; 3] {
                let a = v.as_array().unwrap();
                [0, 1, 2].map(|i| a[i].as_f64().unwrap() as f32)
            };
            let motion = (!m["motion"].is_null()).then(|| Motion {
                rate: floats(&m["motion"]["rate"]),
                accel: floats(&m["motion"]["accel"]),
            });
            PageMessage::State {
                seq: num(&m["seq"]),
                state: ControllerState {
                    buttons: num(&m["buttons"]),
                    sticks: sticks.try_into().unwrap(),
                    triggers: [num(&m["triggers"][0]), num(&m["triggers"][1])],
                    gyro: m["gyro"].as_bool().unwrap(),
                    touches,
                    motion,
                },
            }
        }
        "hidden" => PageMessage::Hidden,
        "list" => PageMessage::List {
            device: hex(m["device"].as_str().unwrap()).try_into().unwrap(),
        },
        "pong" => PageMessage::Pong {
            nonce: num(&m["nonce"]),
        },
        "skin" => PageMessage::Skin {
            id: m["id"].as_str().unwrap().to_owned(),
        },
        other => panic!("unknown page message {other}"),
    }
}

fn bytes_of<const N: usize>(v: &Value) -> Option<[u8; N]> {
    (!v.is_null()).then(|| {
        let a = v.as_array().unwrap();
        std::array::from_fn(|i| num(&a[i]))
    })
}

fn host_message(m: &Value) -> HostMessage {
    match m["type"].as_str().unwrap() {
        "welcome" => HostMessage::Welcome {
            version: num(&m["version"]),
            slot: num(&m["slot"]),
        },
        "in-use" => HostMessage::InUse {
            requested: num(&m["requested"]),
        },
        "opened-elsewhere" => HostMessage::OpenedElsewhere,
        "kicked" => HostMessage::Kicked,
        "version-mismatch" => HostMessage::VersionMismatch {
            host_version: num(&m["hostVersion"]),
        },
        "feedback" => HostMessage::Feedback {
            rumble: bytes_of(&m["rumble"]),
            lightbar: bytes_of(&m["lightbar"]),
        },
        "slot-list" => HostMessage::SlotList {
            phones_can_create: m["phonesCanCreate"].as_bool().unwrap(),
            entries: m["entries"]
                .as_array()
                .unwrap()
                .iter()
                .map(|e| ListEntry {
                    slot: num(&e["slot"]),
                    status: match e["status"].as_str().unwrap() {
                        "waiting" => ListStatus::Waiting,
                        "connected" => ListStatus::Connected,
                        "held" => ListStatus::Held,
                        "held-for-you" => ListStatus::HeldForYou,
                        other => panic!("unknown status {other}"),
                    },
                })
                .collect(),
        },
        "ping" => HostMessage::Ping {
            nonce: num(&m["nonce"]),
            last_rtt: num(&m["lastRtt"]),
        },
        "skins-changed" => HostMessage::SkinsChanged,
        other => panic!("unknown host message {other}"),
    }
}

#[test]
fn page_messages_match_the_vectors() {
    let v = vectors();
    let mut buf = Vec::new();
    for entry in v["page"].as_array().unwrap() {
        let name = entry["name"].as_str().unwrap();
        let expected = hex(entry["hex"].as_str().unwrap());
        let message = page_message(&entry["message"]);
        encode_page(&message, &mut buf);
        assert_eq!(buf, expected, "encode {name}");
        assert_eq!(decode_page(&expected), Ok(Some(message)), "decode {name}");
    }
}

#[test]
fn host_messages_match_the_vectors() {
    let v = vectors();
    let mut buf = Vec::new();
    for entry in v["host"].as_array().unwrap() {
        let name = entry["name"].as_str().unwrap();
        let expected = hex(entry["hex"].as_str().unwrap());
        let message = host_message(&entry["message"]);
        encode_host(&message, &mut buf);
        assert_eq!(buf, expected, "encode {name}");
        assert_eq!(decode_host(&expected), Ok(Some(message)), "decode {name}");
    }
}

#[test]
fn malformed_messages_are_rejected_and_unknown_ones_ignored() {
    assert_eq!(decode_page(&[]), Err(DecodeError::Empty));
    assert_eq!(
        decode_page(&[0x01, 1, 0]),
        Err(DecodeError::BadLength { kind: 0x01, len: 3 })
    );
    // a STATE announcing 2 touches but carrying none
    let mut state = vec![0x02; 21];
    state[19] = 2 << 2;
    assert_eq!(
        decode_page(&state),
        Err(DecodeError::BadLength {
            kind: 0x02,
            len: 21
        })
    );
    // 3 touches is not allowed
    state[19] = 3 << 2;
    assert_eq!(
        decode_page(&state),
        Err(DecodeError::BadValue { kind: 0x02 })
    );
    assert_eq!(
        decode_page(&[0x03, 0]),
        Err(DecodeError::BadLength { kind: 0x03, len: 2 })
    );
    assert_eq!(decode_page(&[0x7f, 1, 2, 3]), Ok(None));
    assert_eq!(
        decode_host(&[0x88, 1, 1, 1, 0, 9]),
        Err(DecodeError::BadValue { kind: 0x88 })
    );
}

#[test]
fn sequence_comparison_wraps_around() {
    assert!(seq_is_newer(2, 1));
    assert!(!seq_is_newer(1, 2));
    assert!(!seq_is_newer(5, 5));
    assert!(seq_is_newer(1, u32::MAX));
    assert!(seq_is_newer(3, u32::MAX - 2));
    assert!(!seq_is_newer(u32::MAX, 1));
}
