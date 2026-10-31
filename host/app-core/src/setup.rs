//! Linux setup: the system changes Ninjoy needs (controller permission, touchpad rule, low
//! ports, firewall opening), how to tell whether each is in place, and the one script that
//! applies the missing ones with a single password prompt. The same commands, with `sudo`, are
//! what the window shows for doing it by hand.
//!
//! Everything here except the system checks is plain text handling, built and tested on every
//! platform. The window translates item ids; reasons are raw command output.

use std::path::{Path, PathBuf};

use ninjoy_devices::uhid_rules;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ItemId {
    Controllers,
    Touchpad,
    Ports,
    Firewall,
}

impl ItemId {
    fn as_str(self) -> &'static str {
        match self {
            Self::Controllers => "controllers",
            Self::Touchpad => "touchpad",
            Self::Ports => "ports",
            Self::Firewall => "firewall",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ItemState {
    Done,
    Missing,
    /// only right after a run
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Firewall {
    Ufw,
    Firewalld,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupItem {
    pub id: ItemId,
    pub state: ItemState,
    /// raw reason (command output) when it failed
    pub reason: Option<String>,
    /// the commands to run by hand (`sudo …`)
    pub commands: Vec<String>,
    /// which firewall, for the firewall item
    pub firewall: Option<Firewall>,
}

/// How the last Configure ended when it did not run the script.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    /// the password prompt was dismissed
    Cancelled,
    /// no password prompt is available (no agent, or no `pkexec`)
    NoPrompt,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupView {
    /// in the order of the spec's FR-001
    pub items: Vec<SetupItem>,
    /// every item is done
    pub ready: bool,
    pub outcome: Option<Outcome>,
    /// every item still to do, as commands to copy
    pub all_commands: String,
}

impl SetupView {
    pub fn new(items: Vec<SetupItem>, outcome: Option<Outcome>) -> Self {
        let all_commands = items
            .iter()
            .filter(|item| item.state != ItemState::Done)
            .flat_map(|item| item.commands.iter().cloned())
            .collect::<Vec<_>>()
            .join("\n");
        Self {
            ready: items.iter().all(|item| item.state == ItemState::Done),
            items,
            outcome,
            all_commands,
        }
    }
}

/// The ports a run opened in ufw, whose rules only root can read.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UfwPorts {
    pub secure: u16,
    pub plain: u16,
}

/// `linux-setup.json` in the data folder: what the setup applied that cannot be read back.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct SetupRecord {
    pub ufw: Option<UfwPorts>,
}

impl SetupRecord {
    fn path(dir: &Path) -> PathBuf {
        dir.join("linux-setup.json")
    }

    /// A missing or broken file is an empty record.
    pub fn load(dir: &Path) -> Self {
        std::fs::read_to_string(Self::path(dir))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dir)?;
        std::fs::write(Self::path(dir), serde_json::to_vec_pretty(self)?)
    }
}

/// The private and local ranges `net::is_lan` accepts (loopback aside): the firewall opens the
/// ports to these only.
pub const LAN_RANGES: [&str; 7] = [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "100.64.0.0/10",
    "169.254.0.0/16",
    "fc00::/7",
    "fe80::/10",
];

/// The local name announcement.
pub const MDNS_PORT: u16 = 5353;

pub const PORT_START_KEY: &str = "net.ipv4.ip_unprivileged_port_start";
pub const PORT_START_FILE: &str = "/etc/sysctl.d/99-ninjoy.conf";

/// One missing item, with what it needs to know to be applied.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Fix {
    Controllers,
    Touchpad,
    /// lets programs use ports from `start` up
    Ports {
        start: u16,
    },
    Ufw {
        secure: u16,
        plain: u16,
        /// the ports the last run opened, whose rules are removed first
        previous: Option<UfwPorts>,
    },
    Firewalld {
        secure: u16,
        plain: u16,
        zones: Vec<String>,
        /// (zone, rule): Ninjoy rules for ports no longer used
        stale: Vec<(String, String)>,
    },
}

/// The value the ports item sets: the lowest wanted port, never above the current one.
pub fn port_start(wanted: u16, current: u16) -> u16 {
    wanted.min(current)
}

/// One step of a fix.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Command {
    /// a file with one line
    Write {
        file: &'static str,
        line: String,
    },
    Run(String),
    /// its failure does not fail the item (removing a rule that may already be gone)
    Try(String),
}

impl Command {
    fn script(&self) -> String {
        match self {
            Self::Write { file, line } => format!("printf '%s\\n' {} > {file}", quote(line)),
            Self::Run(command) => command.clone(),
            Self::Try(command) => format!("{command} || true"),
        }
    }

    fn manual(&self) -> String {
        match self {
            Self::Write { file, line } => {
                format!(
                    "printf '%s\\n' {} | sudo tee {file} > /dev/null",
                    quote(line)
                )
            }
            Self::Run(command) | Self::Try(command) => format!("sudo {command}"),
        }
    }
}

/// Single-quotes `text` for the shell.
fn quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

fn family(range: &str) -> &'static str {
    if range.contains(':') { "ipv6" } else { "ipv4" }
}

/// The ports the firewall opens, with their protocol.
fn opened_ports(secure: u16, plain: u16) -> [(u16, &'static str); 3] {
    [(secure, "tcp"), (plain, "tcp"), (MDNS_PORT, "udp")]
}

fn ufw_rule(range: &str, port: u16, protocol: &str) -> String {
    format!("from {range} to any port {port} proto {protocol}")
}

/// The firewalld rich rule for one range and port, as `--list-rich-rules` prints it.
pub fn rich_rule(range: &str, port: u16, protocol: &str) -> String {
    format!(
        r#"rule family="{}" source address="{range}" port port="{port}" protocol="{protocol}" accept"#,
        family(range)
    )
}

/// Every rich rule the firewall item wants, in one zone.
pub fn wanted_rich_rules(secure: u16, plain: u16) -> Vec<String> {
    LAN_RANGES
        .iter()
        .flat_map(|range| {
            opened_ports(secure, plain)
                .into_iter()
                .map(move |(port, protocol)| rich_rule(range, port, protocol))
        })
        .collect()
}

impl Fix {
    pub fn id(&self) -> ItemId {
        match self {
            Self::Controllers => ItemId::Controllers,
            Self::Touchpad => ItemId::Touchpad,
            Self::Ports { .. } => ItemId::Ports,
            Self::Ufw { .. } | Self::Firewalld { .. } => ItemId::Firewall,
        }
    }

    fn commands(&self) -> Vec<Command> {
        let run = |text: String| Command::Run(text);
        match self {
            Self::Controllers => vec![
                Command::Write {
                    file: uhid_rules::UDEV_RULE_FILE,
                    line: uhid_rules::UDEV_RULE.into(),
                },
                Command::Write {
                    file: uhid_rules::MODULES_LOAD_FILE,
                    line: uhid_rules::MODULE.into(),
                },
                run(format!("modprobe {}", uhid_rules::MODULE)),
                run("udevadm control --reload".into()),
                run(format!(
                    "udevadm trigger --action=change --sysname-match={}",
                    uhid_rules::MODULE
                )),
                run("udevadm settle".into()),
            ],
            Self::Touchpad => vec![
                Command::Write {
                    file: uhid_rules::TOUCHPAD_RULE_FILE,
                    line: uhid_rules::TOUCHPAD_RULE.into(),
                },
                run("udevadm control --reload".into()),
            ],
            Self::Ports { start } => vec![
                Command::Write {
                    file: PORT_START_FILE,
                    line: format!("{PORT_START_KEY} = {start}"),
                },
                run(format!("sysctl -w {PORT_START_KEY}={start}")),
            ],
            Self::Ufw {
                secure,
                plain,
                previous,
            } => {
                let mut commands = Vec::new();
                if let Some(old) = previous {
                    for (port, protocol) in opened_ports(old.secure, old.plain) {
                        if port == *secure || port == *plain || port == MDNS_PORT {
                            continue;
                        }
                        for range in LAN_RANGES {
                            commands.push(Command::Try(format!(
                                "ufw delete allow {}",
                                ufw_rule(range, port, protocol)
                            )));
                        }
                    }
                }
                for range in LAN_RANGES {
                    for (port, protocol) in opened_ports(*secure, *plain) {
                        commands.push(run(format!(
                            "ufw allow {} comment 'Ninjoy'",
                            ufw_rule(range, port, protocol)
                        )));
                    }
                }
                commands
            }
            Self::Firewalld {
                secure,
                plain,
                zones,
                stale,
            } => {
                let mut commands = Vec::new();
                for (zone, rule) in stale {
                    commands.push(Command::Try(format!(
                        "firewall-cmd --permanent --zone={zone} --remove-rich-rule={}",
                        quote(rule)
                    )));
                }
                for zone in zones {
                    for rule in wanted_rich_rules(*secure, *plain) {
                        commands.push(run(format!(
                            "firewall-cmd --permanent --zone={zone} --add-rich-rule={}",
                            quote(&rule)
                        )));
                    }
                }
                commands.push(run("firewall-cmd --reload".into()));
                commands
            }
        }
    }

    /// The commands to run by hand, with `sudo`.
    pub fn manual(&self) -> Vec<String> {
        self.commands().iter().map(Command::manual).collect()
    }
}

/// The script the Configure button runs as root. Each fix is one block that prints
/// `ninjoy-item <id> ok` or `ninjoy-item <id> failed <reason>`; a failed block never stops
/// the next ones.
pub fn script(fixes: &[Fix]) -> String {
    let mut script = String::from("set -u\n");
    for fix in fixes {
        let id = fix.id().as_str();
        let steps: Vec<String> = fix.commands().iter().map(Command::script).collect();
        // stdout is dropped and stderr kept: the reason is what failed
        script.push_str(&format!(
            "out=$( {{\n{}\n}} 2>&1 >/dev/null )\n\
             if [ $? -eq 0 ]; then echo 'ninjoy-item {id} ok'; \
             else echo \"ninjoy-item {id} failed $(printf '%s' \"$out\" | tr '\\n' ' ')\"; fi\n",
            steps.join(" &&\n")
        ));
    }
    script
}

/// Each fix's result from the script's output: `Ok`, or `Err` with the reason. A fix without a
/// line did not run to the end.
pub fn results(fixes: &[Fix], output: &str) -> Vec<(ItemId, Result<(), String>)> {
    fixes
        .iter()
        .map(|fix| {
            let id = fix.id();
            let result = output
                .lines()
                .filter_map(|line| line.strip_prefix("ninjoy-item "))
                .filter_map(|rest| rest.strip_prefix(id.as_str()))
                .filter_map(|rest| rest.strip_prefix(' '))
                .find_map(|rest| {
                    if rest.trim_end() == "ok" {
                        Some(Ok(()))
                    } else {
                        rest.strip_prefix("failed")
                            .map(|reason| Err(reason.trim().to_owned()))
                    }
                })
                .unwrap_or_else(|| Err("no result".to_owned()));
            (id, result)
        })
        .collect()
}

// ---------- reading the system's state (no root) ----------

/// Where `systemd-sysctl` reads settings from, earlier folders first.
pub const SYSCTL_DIRS: [&str; 5] = [
    "/etc/sysctl.d",
    "/run/sysctl.d",
    "/usr/local/lib/sysctl.d",
    "/usr/lib/sysctl.d",
    "/lib/sysctl.d",
];
pub const SYSCTL_CONF: &str = "/etc/sysctl.conf";

/// The value of `key` the system applies at boot, as `systemd-sysctl` resolves it: `*.conf`
/// files from `dirs`, where a file name in an earlier folder hides the same name in later ones,
/// applied in name order; then `conf`. The last assignment wins.
pub fn persisted_sysctl(dirs: &[PathBuf], conf: &Path, key: &str) -> Option<String> {
    let mut files: std::collections::BTreeMap<std::ffi::OsString, PathBuf> = Default::default();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            if Path::new(&name).extension().is_some_and(|e| e == "conf") {
                files.entry(name).or_insert_with(|| entry.path());
            }
        }
    }
    let mut value = None;
    for path in files.values().map(PathBuf::as_path).chain([conf]) {
        if let Ok(text) = std::fs::read_to_string(path)
            && let Some(found) = sysctl_value(&text, key)
        {
            value = Some(found);
        }
    }
    value
}

/// The last assignment of `key` in one sysctl file (`a.b.c = v` or `a/b/c=v`).
fn sysctl_value(text: &str, key: &str) -> Option<String> {
    text.lines().rev().find_map(|line| {
        let line = line.trim();
        if line.starts_with('#') || line.starts_with(';') {
            return None;
        }
        let (name, value) = line.split_once('=')?;
        let name = name.trim().trim_start_matches('-').replace('/', ".");
        (name == key).then(|| value.trim().to_owned())
    })
}

/// `ENABLED=yes` in `/etc/ufw/ufw.conf`.
pub fn ufw_enabled(conf: &str) -> bool {
    conf.lines().any(|line| {
        line.split_once('=').is_some_and(|(name, value)| {
            name.trim() == "ENABLED" && value.trim().trim_matches(['"', '\'']) == "yes"
        })
    })
}

/// The zone names in `firewall-cmd --get-active-zones` output (details are indented).
pub fn active_zones(output: &str) -> Vec<String> {
    output
        .lines()
        .filter(|line| !line.starts_with([' ', '\t']))
        .filter_map(|line| line.split_whitespace().next())
        .map(str::to_owned)
        .collect()
}

/// The rules of `--list-rich-rules` output that Ninjoy adds (its format, for one of its ranges).
pub fn ninjoy_rich_rules(output: &str) -> Vec<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| {
            LAN_RANGES.iter().any(|range| {
                ["tcp", "udp"].iter().any(|protocol| {
                    line.strip_prefix(&format!(
                        r#"rule family="{}" source address="{range}" port port=""#,
                        family(range)
                    ))
                    .and_then(|rest| rest.split_once('"'))
                    .is_some_and(|(port, rest)| {
                        port.parse::<u16>().is_ok()
                            && rest == format!(r#" protocol="{protocol}" accept"#)
                    })
                })
            })
        })
        .map(str::to_owned)
        .collect()
}

/// Whether `modules.builtin` lists the uhid module (built into the kernel).
pub fn uhid_builtin(modules_builtin: &str) -> bool {
    let name = format!("{}.ko", uhid_rules::MODULE);
    modules_builtin
        .lines()
        .any(|line| line.trim().rsplit('/').next() == Some(name.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_fixes() -> Vec<Fix> {
        vec![
            Fix::Controllers,
            Fix::Touchpad,
            Fix::Ports { start: 80 },
            Fix::Ufw {
                secure: 443,
                plain: 80,
                previous: None,
            },
        ]
    }

    #[test]
    fn each_block_reports_its_item_and_never_stops_the_script() {
        let script = script(&all_fixes());
        assert!(script.starts_with("set -u\n"));
        assert!(!script.contains("set -e"));
        for id in ["controllers", "touchpad", "ports", "firewall"] {
            assert!(
                script.contains(&format!("echo 'ninjoy-item {id} ok'")),
                "{id}"
            );
            assert!(
                script.contains(&format!("\"ninjoy-item {id} failed ")),
                "{id}"
            );
        }
    }

    #[test]
    #[cfg(unix)]
    fn the_script_is_valid_shell() {
        let mut fixes = all_fixes();
        fixes.push(Fix::Firewalld {
            secure: 443,
            plain: 80,
            zones: vec!["public".into()],
            stale: vec![("public".into(), rich_rule("10.0.0.0/8", 8443, "tcp"))],
        });
        let status = std::process::Command::new("sh")
            .args(["-n", "-c", &script(&fixes)])
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[test]
    fn the_controllers_and_touchpad_blocks_write_the_rules() {
        let script = script(&[Fix::Controllers, Fix::Touchpad]);
        assert!(script.contains(
            r#"printf '%s\n' 'KERNEL=="uhid", MODE="0660", TAG+="uaccess"' > /etc/udev/rules.d/71-ninjoy-uhid.rules"#
        ));
        assert!(script.contains("printf '%s\\n' 'uhid' > /etc/modules-load.d/ninjoy.conf"));
        assert!(script.contains("modprobe uhid &&\n"));
        assert!(script.contains("udevadm trigger --action=change --sysname-match=uhid"));
        assert!(script.contains(
            r#"'SUBSYSTEM=="input", ATTRS{uniq}=="02:4e:4a:*", ATTRS{name}=="*Touchpad", ENV{LIBINPUT_IGNORE_DEVICE}="1"' > /etc/udev/rules.d/72-ninjoy-touchpad.rules"#
        ));
    }

    #[test]
    fn the_ports_block_uses_the_lowest_wanted_port_never_above_the_current_one() {
        assert_eq!(port_start(80, 1024), 80);
        assert_eq!(port_start(443, 1024), 443);
        assert_eq!(port_start(80, 0), 0);
        let script = script(&[Fix::Ports { start: 80 }]);
        assert!(script.contains(
            "printf '%s\\n' 'net.ipv4.ip_unprivileged_port_start = 80' > /etc/sysctl.d/99-ninjoy.conf"
        ));
        assert!(script.contains("sysctl -w net.ipv4.ip_unprivileged_port_start=80"));
    }

    #[test]
    fn ufw_opens_each_range_for_both_ports_and_mdns_and_removes_old_ports() {
        let fix = Fix::Ufw {
            secure: 9443,
            plain: 80,
            previous: Some(UfwPorts {
                secure: 443,
                plain: 80,
            }),
        };
        let manual = fix.manual();
        let allows: Vec<&String> = manual.iter().filter(|c| c.contains("ufw allow")).collect();
        assert_eq!(allows.len(), 7 * 3);
        assert!(
            manual.contains(
                &"sudo ufw allow from 192.168.0.0/16 to any port 9443 proto tcp comment 'Ninjoy'"
                    .into()
            )
        );
        assert!(manual.contains(
            &"sudo ufw allow from fe80::/10 to any port 5353 proto udp comment 'Ninjoy'".into()
        ));
        // only the port that changed is removed, before anything is added
        let deletes: Vec<&String> = manual.iter().filter(|c| c.contains("ufw delete")).collect();
        assert_eq!(deletes.len(), 7);
        assert!(deletes.iter().all(|c| c.contains("port 443 proto tcp")));
        assert!(manual[0].contains("ufw delete"));
        assert!(
            script(&[fix])
                .contains("ufw delete allow from 10.0.0.0/8 to any port 443 proto tcp || true")
        );
    }

    #[test]
    fn firewalld_adds_rich_rules_per_active_zone_then_reloads() {
        let fix = Fix::Firewalld {
            secure: 443,
            plain: 80,
            zones: vec!["public".into(), "home".into()],
            stale: vec![("public".into(), rich_rule("10.0.0.0/8", 8443, "tcp"))],
        };
        let manual = fix.manual();
        assert_eq!(
            manual[0],
            r#"sudo firewall-cmd --permanent --zone=public --remove-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="8443" protocol="tcp" accept'"#
        );
        let adds = manual
            .iter()
            .filter(|c| c.contains("--add-rich-rule"))
            .count();
        assert_eq!(adds, 2 * 7 * 3);
        assert!(manual.contains(
            &r#"sudo firewall-cmd --permanent --zone=home --add-rich-rule='rule family="ipv6" source address="fc00::/7" port port="5353" protocol="udp" accept'"#.into()
        ));
        assert_eq!(manual.last().unwrap(), "sudo firewall-cmd --reload");
    }

    #[test]
    fn manual_commands_are_the_script_commands_with_sudo() {
        let manual = Fix::Controllers.manual();
        assert_eq!(
            manual[0],
            r#"printf '%s\n' 'KERNEL=="uhid", MODE="0660", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/71-ninjoy-uhid.rules > /dev/null"#
        );
        assert_eq!(manual[2], "sudo modprobe uhid");
        assert_eq!(
            Fix::Ports { start: 80 }.manual()[1],
            "sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80"
        );
    }

    #[test]
    fn results_come_from_the_item_lines() {
        let output = "noise\nninjoy-item controllers ok\n\
                      ninjoy-item touchpad failed udevadm: not found \n\
                      ninjoy-item ports ok\n";
        let fixes = all_fixes();
        assert_eq!(
            results(&fixes, output),
            vec![
                (ItemId::Controllers, Ok(())),
                (ItemId::Touchpad, Err("udevadm: not found".into())),
                (ItemId::Ports, Ok(())),
                (ItemId::Firewall, Err("no result".into())),
            ]
        );
    }

    #[test]
    fn the_view_is_ready_when_every_item_is_done_and_lists_what_is_left() {
        let item = |id, state, commands: &[&str]| SetupItem {
            id,
            state,
            reason: None,
            commands: commands.iter().map(|c| c.to_string()).collect(),
            firewall: None,
        };
        let view = SetupView::new(
            vec![
                item(ItemId::Controllers, ItemState::Done, &["sudo a"]),
                item(ItemId::Touchpad, ItemState::Missing, &["sudo b", "sudo c"]),
                item(ItemId::Ports, ItemState::Failed, &["sudo d"]),
            ],
            Some(Outcome::Cancelled),
        );
        assert!(!view.ready);
        assert_eq!(view.all_commands, "sudo b\nsudo c\nsudo d");
        let json = serde_json::to_value(&view).unwrap();
        assert_eq!(json["outcome"], "cancelled");
        assert_eq!(json["items"][1]["state"], "missing");
        assert_eq!(json["allCommands"], "sudo b\nsudo c\nsudo d");
        assert!(SetupView::new(vec![item(ItemId::Touchpad, ItemState::Done, &[])], None).ready);
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ninjoy-setup-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_persisted_sysctl_value_follows_systemd_order() {
        let root = temp_dir("sysctl");
        let (etc, usr) = (root.join("etc"), root.join("usr"));
        std::fs::create_dir_all(&etc).unwrap();
        std::fs::create_dir_all(&usr).unwrap();
        let conf = root.join("sysctl.conf");
        let key = PORT_START_KEY;
        let dirs = [etc.clone(), usr.clone()];
        assert_eq!(persisted_sysctl(&dirs, &conf, key), None);

        std::fs::write(usr.join("50-default.conf"), format!("{key} = 1024\n")).unwrap();
        assert_eq!(persisted_sysctl(&dirs, &conf, key).as_deref(), Some("1024"));
        // a later name wins
        std::fs::write(
            usr.join("99-ninjoy.conf"),
            "net/ipv4/ip_unprivileged_port_start=80\n",
        )
        .unwrap();
        assert_eq!(persisted_sysctl(&dirs, &conf, key).as_deref(), Some("80"));
        // the same name in an earlier folder hides the later one
        std::fs::write(
            etc.join("99-ninjoy.conf"),
            format!("# {key} = 1\n{key} = 443\n"),
        )
        .unwrap();
        assert_eq!(persisted_sysctl(&dirs, &conf, key).as_deref(), Some("443"));
        // /etc/sysctl.conf comes last
        std::fs::write(&conf, format!("-{key}=500\n")).unwrap();
        assert_eq!(persisted_sysctl(&dirs, &conf, key).as_deref(), Some("500"));
        // only .conf files count
        std::fs::write(etc.join("zz.bak"), format!("{key} = 1\n")).unwrap();
        assert_eq!(persisted_sysctl(&dirs, &conf, key).as_deref(), Some("500"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn ufw_is_enabled_by_its_config() {
        assert!(ufw_enabled("# comment\nENABLED=yes\nLOGLEVEL=low\n"));
        assert!(!ufw_enabled("ENABLED=no\n"));
        assert!(!ufw_enabled("#ENABLED=yes\n"));
        assert!(!ufw_enabled(""));
    }

    #[test]
    fn active_zones_are_the_unindented_lines() {
        let output = "home\n  interfaces: wlan0\npublic (default)\n  interfaces: eth0\n  sources: 10.0.0.0/8\n";
        assert_eq!(active_zones(output), ["home", "public"]);
        assert!(active_zones("").is_empty());
    }

    #[test]
    fn ninjoy_rich_rules_are_recognized() {
        let ours = rich_rule("192.168.0.0/16", 8443, "tcp");
        let mdns = rich_rule("fe80::/10", 5353, "udp");
        let output = format!(
            "{ours}\nrule family=\"ipv4\" source address=\"8.8.8.8\" port port=\"443\" protocol=\"tcp\" accept\n\
             rule service name=\"ssh\" accept\n  {mdns}\n"
        );
        assert_eq!(ninjoy_rich_rules(&output), [ours, mdns]);
    }

    #[test]
    fn uhid_may_be_built_into_the_kernel() {
        assert!(uhid_builtin(
            "kernel/drivers/hid/hid.ko\nkernel/drivers/hid/uhid.ko\n"
        ));
        assert!(!uhid_builtin(
            "kernel/drivers/hid/hid.ko\nkernel/drivers/hid/uhid-extra.ko\n"
        ));
    }

    #[test]
    fn the_record_is_saved_and_loaded() {
        let dir = temp_dir("record");
        assert_eq!(SetupRecord::load(&dir), SetupRecord::default());
        let record = SetupRecord {
            ufw: Some(UfwPorts {
                secure: 443,
                plain: 80,
            }),
        };
        record.save(&dir).unwrap();
        assert_eq!(SetupRecord::load(&dir), record);
        let text = std::fs::read_to_string(dir.join("linux-setup.json")).unwrap();
        assert!(text.contains("\"secure\": 443"), "{text}");
        let _ = std::fs::remove_dir_all(dir);
    }
}
