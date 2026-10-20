//! Windows backend: one ViGEmBus DualShock 4 target per pad.

use ninjoy_session::Feedback;
use vigem_rust::{Client, Ds4ReportEx, DualShock4, TargetHandle};

use crate::backend::{Backend, DeviceError, OnFeedback, Pad, Unavailable};
use crate::ds4::Report;

/// Where players get the driver.
pub const DRIVER_URL: &str = "https://github.com/nefarius/ViGEmBus/releases";

pub struct VigemBackend {
    client: Client,
}

/// Connects to the ViGEmBus driver.
pub fn open() -> Result<VigemBackend, Unavailable> {
    Client::connect()
        .map(|client| VigemBackend { client })
        .map_err(|error| Unavailable {
            reason: format!("The ViGEmBus driver is not available ({error})"),
            fix: format!("Install ViGEmBus from {DRIVER_URL} and start Ninjoy again."),
        })
}

impl Backend for VigemBackend {
    fn name(&self) -> &'static str {
        "ViGEmBus"
    }

    fn plug(&self, slot: u16, feedback: OnFeedback) -> Result<Box<dyn Pad>, DeviceError> {
        let handle = self
            .client
            .new_ds4_target()
            .plug()
            .and_then(|plugged| plugged.wait_for_ready())
            .map_err(|e| DeviceError(format!("ViGEmBus could not create the pad: {e}")))?;
        // the game's rumble and lightbar arrive as notifications, on a thread per pad; it ends
        // when the pad is unplugged
        if let Ok(notifications) = handle.register_notification() {
            std::thread::Builder::new()
                .name(format!("ninjoy-pad-{slot}-feedback"))
                .spawn(move || {
                    while let Ok(n) = notifications.recv() {
                        feedback(Feedback {
                            rumble: Some((
                                f32::from(n.large_motor) / 255.0,
                                f32::from(n.small_motor) / 255.0,
                            )),
                            lightbar: Some([n.lightbar.red, n.lightbar.green, n.lightbar.blue]),
                        });
                    }
                })
                .map_err(|e| DeviceError(format!("feedback thread: {e}")))?;
        }
        Ok(Box::new(VigemPad { handle }))
    }
}

struct VigemPad {
    handle: TargetHandle<DualShock4>,
}

impl Pad for VigemPad {
    fn submit(&mut self, report: &Report) -> Result<(), DeviceError> {
        // ViGEm's extended report is the USB report without its id byte
        let mut payload = [0u8; 63];
        payload.copy_from_slice(&report[1..]);
        self.handle
            .update_ex(&Ds4ReportEx::from_bytes(payload))
            .map_err(|e| DeviceError(format!("ViGEmBus update failed: {e}")))
    }
}
