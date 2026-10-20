//! ViGEmBus backend against the real driver (Windows with ViGEmBus installed):
//! `cargo test -p ninjoy-devices --test vigem -- --ignored`.
#![cfg(windows)]

use std::sync::Arc;

use ninjoy_devices::ds4::Ds4Pad;
use ninjoy_devices::{Backend, vigem};
use ninjoy_session::ControllerState;

#[test]
#[ignore = "needs the ViGEmBus driver"]
fn plugs_updates_and_unplugs_a_pad() {
    let backend = vigem::open().expect("ViGEmBus installed");
    assert_eq!(backend.name(), "ViGEmBus");
    let mut pads: Vec<_> = (1..=4)
        .map(|slot| backend.plug(slot, Arc::new(|_| {})).expect("pad plugged"))
        .collect();
    let mut ds4 = Ds4Pad::new();
    for (i, pad) in pads.iter_mut().enumerate() {
        let state = ControllerState {
            buttons: 1 << i,
            ..ControllerState::NEUTRAL
        };
        pad.submit(&ds4.report(&state, 0)).expect("report accepted");
    }
    drop(pads); // unplugged
}
