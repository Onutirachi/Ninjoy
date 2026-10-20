//! Development host: runs the Ninjoy session core from a terminal, so the whole path can be
//! tested with real phones before the desktop app exists.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;

use ninjoy_session::state::button;
use ninjoy_session::{ControllerState, Feedback, Session, SessionConfig, StateSink};
use tokio::io::{AsyncBufReadExt, BufReader};

const HELP: &str = "commands: list | create [n] | remove <n> | kick <n> | watch <n|off> | phones <on|off> | rumble <n> <strong 0-1> <weak 0-1> | light <n> <#rrggbb> | quit";

/// Prints the states of the watched slot.
#[derive(Default)]
struct PrintSink {
    watched: AtomicU16,
}

impl StateSink for PrintSink {
    fn on_state(&self, slot: u16, state: &ControllerState) {
        if self.watched.load(Ordering::Relaxed) == slot {
            println!("[{slot}] {}", describe(state));
        }
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

fn parse_args() -> Result<SessionConfig, String> {
    let mut config = SessionConfig::default();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut value = || args.next().ok_or_else(|| format!("{arg} needs a value"));
        match arg.as_str() {
            "--plain-port" => {
                config.plain_ports = vec![value()?.parse().map_err(|_| "invalid port")?]
            }
            "--grace" => {
                config.grace = Duration::from_secs(value()?.parse().map_err(|_| "invalid seconds")?)
            }
            "--web" => config.web_root = Some(PathBuf::from(value()?)),
            "--help" | "-h" => {
                println!("ninjoy-devhost [--plain-port N] [--grace SECONDS] [--web DIR]\n{HELP}");
                std::process::exit(0);
            }
            other => return Err(format!("unknown option {other}")),
        }
    }
    Ok(config)
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
                .unwrap_or_else(|_| "ninjoy_session=info".into()),
        )
        .with_target(false)
        .init();
    let config = match parse_args() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("{error}\nrun with --help for options");
            std::process::exit(2);
        }
    };
    let sink = Arc::new(PrintSink::default());
    let session = match Session::start(config, sink.clone()).await {
        Ok(session) => session,
        Err(error) => {
            eprintln!("could not start: {error}");
            std::process::exit(1);
        }
    };

    let a = session.addresses();
    let port = if a.plain_port == 80 {
        String::new()
    } else {
        format!(":{}", a.plain_port)
    };
    println!("\nNinjoy session");
    for ip in &a.ips {
        println!("  http://{ip}{port}/");
    }
    if a.ips.is_empty() {
        println!("  (no network address found; is the PC on Wi-Fi or Ethernet?)");
    }
    println!(
        "If phones cannot open it, allow this program through the PC firewall on private networks."
    );
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
                            format!("  {:>3}  {:<24?}  {device}{rtt}", s.number, s.status)
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
    session.shutdown().await;
}
