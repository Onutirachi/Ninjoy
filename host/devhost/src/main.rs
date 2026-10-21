//! Development host: runs the Ninjoy session core from a terminal, so the whole path can be
//! tested with real phones before the desktop app exists.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::time::Duration;

use ninjoy_devices::{DeviceHub, PadStatus, Unavailable};
use ninjoy_session::state::button;
use ninjoy_session::{ControllerState, Feedback, Session, SessionConfig, StateSink};
use tokio::io::{AsyncBufReadExt, BufReader};

const HELP: &str = "commands: list | create [n] | remove <n> | kick <n> | watch <n|off> | feedback | phones <on|off> | rumble <n> <strong 0-1> <weak 0-1> | light <n> <#rrggbb> | quit";

/// Hands every state to the virtual pads and prints the watched slot's.
struct DevSink {
    watched: AtomicU16,
    hub: DeviceHub,
}

impl StateSink for DevSink {
    fn on_state(&self, slot: u16, state: &ControllerState) {
        self.hub.on_state(slot, state);
        if self.watched.load(Ordering::Relaxed) == slot {
            println!("[{slot}] {}", describe(state));
        }
    }
}

fn pad_status(status: Option<PadStatus>) -> String {
    match status {
        Some(PadStatus::Plugged) => "DS4".into(),
        Some(PadStatus::Failed(why)) => format!("no DS4 ({why})"),
        Some(PadStatus::Unavailable) | None => "no DS4".into(),
    }
}

fn describe(s: &ControllerState) -> String {
    let pressed: Vec<&str> = (0..18)
        .filter(|&b| s.pressed(b))
        .map(|b| button::NAMES[b as usize])
        .collect();
    let mut line = format!(
        "buttons [{}]  L({:+.2},{:+.2}) R({:+.2},{:+.2})  L2 {:.2} R2 {:.2}",
        pressed.join(" "),
        s.sticks[0] as f32 / 32767.0,
        s.sticks[1] as f32 / 32767.0,
        s.sticks[2] as f32 / 32767.0,
        s.sticks[3] as f32 / 32767.0,
        s.triggers[0] as f32 / 255.0,
        s.triggers[1] as f32 / 255.0,
    );
    for t in s.touches.iter().flatten() {
        line += &format!(
            "  touch#{} ({:.2},{:.2})",
            t.id,
            t.x as f32 / 65535.0,
            t.y as f32 / 65535.0
        );
    }
    if let Some(m) = s.motion {
        line += &format!(
            "  gyro {:+.1} {:+.1} {:+.1}",
            m.rate[0], m.rate[1], m.rate[2]
        );
    }
    line
}

fn parse_args() -> Result<(SessionConfig, bool), String> {
    let mut config = SessionConfig::default();
    let mut devices = true;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut value = || args.next().ok_or_else(|| format!("{arg} needs a value"));
        match arg.as_str() {
            "--plain-port" => {
                config.plain_ports = vec![value()?.parse().map_err(|_| "invalid port")?]
            }
            "--port" => config.secure_ports = vec![value()?.parse().map_err(|_| "invalid port")?],
            "--name" => config.local_name = value()?,
            "--grace" => {
                config.grace = Duration::from_secs(value()?.parse().map_err(|_| "invalid seconds")?)
            }
            "--web" => config.web_root = Some(PathBuf::from(value()?)),
            "--skins" => config.skins_dir = Some(PathBuf::from(value()?)),
            "--no-devices" => devices = false,
            "--help" | "-h" => {
                println!(
                    "ninjoy-devhost [--port N] [--plain-port N] [--name NAME] [--grace SECONDS] [--web DIR] [--skins DIR] [--no-devices]\n{HELP}"
                );
                std::process::exit(0);
            }
            other => return Err(format!("unknown option {other}")),
        }
    }
    Ok((config, devices))
}

fn parse_color(s: &str) -> Option<[u8; 3]> {
    let hex = s.trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let v = u32::from_str_radix(hex, 16).ok()?;
    Some([(v >> 16) as u8, (v >> 8) as u8, v as u8])
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ninjoy_session=info,ninjoy_devices=info".into()),
        )
        .with_target(false)
        .init();
    let (config, devices) = match parse_args() {
        Ok(parsed) => parsed,
        Err(error) => {
            eprintln!("{error}\nrun with --help for options");
            std::process::exit(2);
        }
    };
    let hub = DeviceHub::new(if devices {
        ninjoy_devices::open_default()
    } else {
        Err(Unavailable {
            reason: "Virtual controllers are off (--no-devices)".into(),
            fix: String::new(),
        })
    });
    let printing_feedback = Arc::new(AtomicBool::new(false));
    let print = printing_feedback.clone();
    hub.on_feedback(move |slot, f| {
        if print.load(Ordering::Relaxed) {
            println!(
                "[{slot}] game feedback: rumble {:?} lightbar {:?}",
                f.rumble, f.lightbar
            );
        }
    });
    let sink = Arc::new(DevSink {
        watched: AtomicU16::new(0),
        hub: hub.clone(),
    });
    let session = match Session::start(config, sink.clone()).await {
        Ok(session) => session,
        Err(error) => {
            eprintln!("could not start: {error}");
            std::process::exit(1);
        }
    };

    hub.attach(&session);

    let a = session.addresses();
    let port = |p: u16, default: u16| {
        if p == default {
            String::new()
        } else {
            format!(":{p}")
        }
    };
    println!("\nNinjoy session");
    let hosts = a
        .name
        .iter()
        .cloned()
        .chain(a.ips.iter().map(|ip| ip.to_string()));
    for ip in hosts {
        let plain = format!("http://{ip}{}/", port(a.plain_port, 80));
        match a.secure_port {
            Some(secure) => println!(
                "  {plain}  (explains the certificate, then opens https://{ip}{}/)",
                port(secure, 443)
            ),
            None => println!("  {plain}?plain  (no HTTPS: motion sensors off)"),
        }
    }
    if a.ips.is_empty() {
        println!("  (no network address found; is the PC on Wi-Fi or Ethernet?)");
    }
    println!(
        "If phones cannot open it, allow this program through the PC firewall on private networks."
    );
    match (hub.backend_name(), hub.unavailable()) {
        (Some(name), _) => println!("Virtual DualShock 4 per controller ({name})."),
        (None, Some(why)) => println!("! No virtual controllers: {why}"),
        (None, None) => {}
    }
    println!("{HELP}\n");

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut quit = false;
    while let Ok(Some(line)) = lines.next_line().await {
        let words: Vec<&str> = line.split_whitespace().collect();
        let number = |i: usize| words.get(i).and_then(|w| w.parse::<u16>().ok());
        let unit = |i: usize| words.get(i).and_then(|w| w.parse::<f32>().ok());
        let result: Result<String, String> = match words.as_slice() {
            [] => continue,
            ["list"] => {
                let slots = session.slots();
                if slots.is_empty() {
                    Ok("no controllers".into())
                } else {
                    Ok(slots
                        .iter()
                        .map(|s| {
                            let device =
                                s.device.as_ref().map(|d| d.to_string()).unwrap_or_default();
                            let rtt = s
                                .rtt
                                .map(|r| format!("  {:.1} ms", r.as_secs_f64() * 1000.0))
                                .unwrap_or_default();
                            let pad = pad_status(hub.status(s.number));
                            format!(
                                "  {:>3}  {:<24?}  {pad:<8}  {device}{rtt}",
                                s.number, s.status
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n"))
                }
            }
            ["create"] => Ok(format!("controller {} created", session.create_slot())),
            ["create", _] => match number(1) {
                Some(n) => session
                    .create_slot_at(n)
                    .map(|_| format!("controller {n} created"))
                    .map_err(|e| e.to_string()),
                None => Err("usage: create [n]".into()),
            },
            ["remove", _] => match number(1) {
                Some(n) => session
                    .remove_slot(n)
                    .map(|_| format!("controller {n} removed"))
                    .map_err(|e| e.to_string()),
                None => Err("usage: remove <n>".into()),
            },
            ["kick", _] => match number(1) {
                Some(n) => session
                    .kick(n)
                    .map(|_| format!("controller {n} kicked"))
                    .map_err(|e| e.to_string()),
                None => Err("usage: kick <n>".into()),
            },
            ["watch", "off"] => {
                sink.watched.store(0, Ordering::Relaxed);
                Ok("not watching".into())
            }
            ["watch", _] => match number(1) {
                Some(n) => {
                    sink.watched.store(n, Ordering::Relaxed);
                    Ok(format!("watching controller {n} (watch off to stop)"))
                }
                None => Err("usage: watch <n|off>".into()),
            },
            ["feedback"] => {
                let on = !printing_feedback.fetch_xor(true, Ordering::Relaxed);
                Ok(format!(
                    "printing the game's feedback: {}",
                    if on { "on" } else { "off" }
                ))
            }
            ["phones", on @ ("on" | "off")] => {
                session.set_phones_can_create(*on == "on");
                Ok(format!("phones can create controllers: {on}"))
            }
            ["rumble", _, _, _] => match (number(1), unit(2), unit(3)) {
                (Some(n), Some(strong), Some(weak)) => {
                    session.send_feedback(
                        n,
                        Feedback {
                            rumble: Some((strong, weak)),
                            lightbar: None,
                        },
                    );
                    Ok(format!("rumble sent to {n}"))
                }
                _ => Err("usage: rumble <n> <strong 0-1> <weak 0-1>".into()),
            },
            ["light", _, color] => match (number(1), parse_color(color)) {
                (Some(n), Some(rgb)) => {
                    session.send_feedback(
                        n,
                        Feedback {
                            rumble: None,
                            lightbar: Some(rgb),
                        },
                    );
                    Ok(format!("lightbar sent to {n}"))
                }
                _ => Err("usage: light <n> <#rrggbb>".into()),
            },
            ["quit" | "exit"] => {
                quit = true;
                break;
            }
            _ => Err(HELP.into()),
        };
        match result {
            Ok(text) => println!("{text}"),
            Err(text) => println!("! {text}"),
        }
    }
    if !quit {
        // no terminal input (started from another tool): keep serving until Ctrl+C
        let _ = tokio::signal::ctrl_c().await;
    }
    hub.unplug_all();
    session.shutdown().await;
}
