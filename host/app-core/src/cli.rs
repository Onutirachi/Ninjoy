//! `ninjoy create [n] | remove <n> | kick <n> | list`: commands for the running app.

use std::io::Write;

use crate::channel::{self, ChannelError};

pub const USAGE: &str = "usage: ninjoy [create [number] | remove <number> | kick <number> | list]\n       (with no command, starts Ninjoy)";

/// Runs a command line on this user's channel: `None` when the arguments are not a command (the
/// app should start), otherwise the exit code after printing the answer.
pub fn run(args: &[String]) -> Option<i32> {
    run_with(&channel::default_name(), args, &mut std::io::stdout())
}

pub fn run_with(name: &str, args: &[String], out: &mut dyn Write) -> Option<i32> {
    let words: Vec<&str> = args.iter().map(String::as_str).collect();
    let valid_number = |w: &str| w.parse::<u16>().is_ok();
    let request = match words.as_slice() {
        ["create"] | ["list"] => words.join(" "),
        ["create", n] | ["remove", n] | ["kick", n] if valid_number(n) => words.join(" "),
        ["create" | "remove" | "kick" | "list", ..] | ["help" | "--help" | "-h"] => {
            let _ = writeln!(out, "{USAGE}");
            return Some(
                if words
                    .first()
                    .is_some_and(|w| w.starts_with('-') || *w == "help")
                {
                    0
                } else {
                    2
                },
            );
        }
        _ => return None,
    };
    match channel::send(name, &request) {
        Ok((ok, text)) => {
            let _ = writeln!(out, "{text}");
            Some(if ok { 0 } else { 1 })
        }
        Err(ChannelError::NotRunning) => {
            let _ = writeln!(out, "Ninjoy is not running. Start it, then try again.");
            Some(1)
        }
        Err(e) => {
            let _ = writeln!(out, "could not reach Ninjoy: {e}");
            Some(1)
        }
    }
}
