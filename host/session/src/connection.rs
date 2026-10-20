//! One WebSocket connection: handshake, states, keepalive/loss timers and orders from the host.

use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio::time::{Instant, sleep_until};

use crate::device::summarize;
use crate::protocol::{
    DeviceId, HostMessage, PROTOCOL_VERSION, PageMessage, decode_page, encode_host, seq_is_newer,
};
use crate::shared::{Control, Live, SessionEvent, Shared, lock};
use crate::slots::{ConnId, Join};
use crate::state::ControllerState;

/// A page must say HELLO or LIST within this time after connecting.
pub const HELLO_DEADLINE: Duration = Duration::from_secs(5);
pub const PING_INTERVAL: Duration = Duration::from_secs(1);

/// WebSocket close code for malformed data (RFC 6455).
const INVALID_DATA: u16 = 1007;

struct Joined {
    slot: u16,
    live: Arc<Mutex<Live>>,
    last_seq: Option<u32>,
    last_state: ControllerState,
}

enum Exit {
    /// connection lost, closed by the page or timed out
    Lost,
    /// kicked, replaced or refused: the host already did the bookkeeping
    Done,
}

pub(crate) async fn run(shared: Arc<Shared>, socket: WebSocket, user_agent: String) {
    let conn = shared.next_conn();
    let (control_tx, mut control) = mpsc::channel(32);
    lock(&shared.conns).insert(conn, control_tx);

    let (mut tx, mut rx) = socket.split();
    let mut out = Vec::with_capacity(64);
    let mut list_rx = shared.list_version.subscribe();
    let mut listing: Option<DeviceId> = None;
    let mut joined: Option<Joined> = None;
    let mut deadline = Instant::now() + HELLO_DEADLINE;
    let mut ping = tokio::time::interval(PING_INTERVAL);
    let mut ping_nonce: u32 = 0;
    let mut ping_sent: Option<(u32, Instant)> = None;
    let mut last_rtt = 0u16;

    macro_rules! send {
        ($message:expr) => {{
            encode_host(&$message, &mut out);
            if tx.send(Message::Binary(out.clone().into())).await.is_err() {
                break Exit::Lost;
            }
        }};
    }

    let exit = loop {
        tokio::select! {
            message = rx.next() => {
                let bytes = match message {
                    Some(Ok(Message::Binary(bytes))) => bytes,
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break Exit::Lost,
                    Some(Ok(_)) => continue, // text, ping and pong frames are not part of the protocol
                };
                let message = match decode_page(&bytes) {
                    Ok(Some(message)) => message,
                    Ok(None) => continue,
                    Err(error) => {
                        tracing::warn!(conn, %error, "malformed message");
                        let _ = tx.send(Message::Close(Some(CloseFrame { code: INVALID_DATA, reason: "malformed message".into() }))).await;
                        break Exit::Lost;
                    }
                };
                if joined.is_some() {
                    deadline = Instant::now() + shared.loss_timeout;
                }
                match message {
                    PageMessage::Hello { version, .. } if version != PROTOCOL_VERSION => {
                        send!(HostMessage::VersionMismatch { host_version: PROTOCOL_VERSION });
                        break Exit::Done;
                    }
                    PageMessage::Hello { slot: requested, device, .. } => {
                        if joined.is_some() {
                            continue; // already playing on this connection
                        }
                        match join(&shared, conn, requested, device, &user_agent) {
                            Join::Joined { slot, .. } => {
                                listing = None;
                                joined = Some(Joined { slot, live: shared.live(slot), last_seq: None, last_state: ControllerState::NEUTRAL });
                                deadline = Instant::now() + shared.loss_timeout;
                                send!(HostMessage::Welcome { version: PROTOCOL_VERSION, slot });
                            }
                            Join::InUse { requested } => send!(HostMessage::InUse { requested }),
                            Join::NotAllowed => send!(HostMessage::InUse { requested: 0 }),
                        }
                    }
                    PageMessage::List { device } => {
                        if joined.is_none() {
                            listing = Some(device);
                            deadline = far_future();
                            let list = slot_list(&shared, Some(device));
                            send!(list);
                        }
                    }
                    PageMessage::State { seq, state } => {
                        let Some(j) = joined.as_mut() else { continue };
                        if j.last_seq.is_some_and(|last| !seq_is_newer(seq, last)) {
                            continue; // late or duplicated: a newer state was already applied
                        }
                        j.last_seq = Some(seq);
                        j.last_state = state;
                        if !shared.deliver(j.slot, conn, &j.live, &state) {
                            break Exit::Done; // replaced or kicked meanwhile
                        }
                    }
                    PageMessage::Hidden => {
                        if let Some(j) = joined.as_ref() {
                            shared.deliver(j.slot, conn, &j.live, &j.last_state.released());
                        }
                    }
                    PageMessage::Pong { nonce } => {
                        if let (Some(j), Some((sent_nonce, sent_at))) = (joined.as_ref(), ping_sent)
                            && nonce == sent_nonce
                        {
                            let rtt = sent_at.elapsed();
                            last_rtt = (rtt.as_micros() / 100).min(u16::MAX as u128).max(1) as u16;
                            lock(&j.live).rtt = Some(rtt);
                            ping_sent = None;
                        }
                    }
                }
            }
            Some(order) = control.recv() => match order {
                Control::Send(message) => send!(message),
                Control::Kick => {
                    send!(HostMessage::Kicked);
                    break Exit::Done;
                }
                Control::Replaced => {
                    send!(HostMessage::OpenedElsewhere);
                    break Exit::Done;
                }
            },
            Ok(()) = list_rx.changed(), if listing.is_some() => {
                let list = slot_list(&shared, listing);
                send!(list);
            }
            _ = ping.tick(), if joined.is_some() => {
                ping_nonce = ping_nonce.wrapping_add(1);
                ping_sent = Some((ping_nonce, Instant::now()));
                send!(HostMessage::Ping { nonce: ping_nonce, last_rtt });
            }
            () = sleep_until(deadline) => {
                tracing::debug!(conn, "no message in time");
                break Exit::Lost;
            }
        }
    };

    lock(&shared.conns).remove(&conn);
    if let (Exit::Lost, Some(j)) = (exit, joined) {
        // release everything before telling anyone the device is gone
        if shared.deliver(j.slot, conn, &j.live, &j.last_state.released()) {
            lock(&j.live).owner = 0;
        }
        let until = Instant::now() + shared.grace();
        if shared.with_table(|t| t.leave(j.slot, conn, until)) {
            shared.emit(SessionEvent::Disconnected { slot: j.slot });
        }
    }
    let _ = tx.close().await;
}

fn far_future() -> Instant {
    Instant::now() + Duration::from_secs(60 * 60 * 24 * 365)
}

fn slot_list(shared: &Shared, device: Option<DeviceId>) -> HostMessage {
    let table = lock(&shared.table);
    HostMessage::SlotList {
        phones_can_create: table.phones_can_create(),
        entries: table.list(device),
    }
}

fn join(shared: &Shared, conn: ConnId, requested: u16, device: DeviceId, user_agent: &str) -> Join {
    let result = shared.with_table(|t| {
        let result = t.join(requested, device, conn, SystemTime::now());
        if let Join::Joined {
            slot,
            resumed: false,
            replaced: None,
        } = result
            && let Some(s) = t.get_mut(slot)
        {
            s.summary = Some(summarize(user_agent));
        }
        result
    });
    if let Join::Joined {
        slot,
        resumed,
        replaced,
    } = result
    {
        lock(&shared.live(slot)).owner = conn;
        if let Some(old) = replaced {
            shared.control(old, Control::Replaced);
        }
        if resumed || replaced.is_some() {
            shared.emit(SessionEvent::Reconnected { slot });
        } else {
            shared.emit(SessionEvent::Connected {
                slot,
                device: summarize(user_agent),
            });
        }
    }
    result
}
