//! Controller slots: numbering, waiting/connected/held states and who may take them.
//!
//! Pure bookkeeping (no I/O, the clock is passed in), so every rule of the spec is unit tested.

use std::collections::BTreeMap;
use std::time::SystemTime;

use tokio::time::Instant;

use crate::device::DeviceSummary;
use crate::protocol::{DeviceId, ListEntry, ListStatus};

/// Identifies one WebSocket connection.
pub type ConnId = u64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SlotStatus {
    /// created by the host, no device yet
    Waiting,
    Connected,
    /// the device dropped; the slot is kept for it until `until`
    Held {
        until: Instant,
    },
}

#[derive(Clone, Debug)]
pub struct Slot {
    pub status: SlotStatus,
    pub device: Option<DeviceId>,
    pub conn: Option<ConnId>,
    pub summary: Option<DeviceSummary>,
    pub connected_since: Option<SystemTime>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Join {
    /// `replaced`: an older connection of the same device that must be told and closed
    Joined {
        slot: u16,
        resumed: bool,
        replaced: Option<ConnId>,
    },
    InUse {
        requested: u16,
    },
    /// phones may not create controllers
    NotAllowed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SlotError {
    NotFound,
    /// the number is already in use
    Taken,
    /// only waiting slots can be removed
    NotWaiting,
    /// slot numbers start at 1
    Invalid,
}

impl std::fmt::Display for SlotError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::NotFound => "no such controller",
            Self::Taken => "that number is already in use",
            Self::NotWaiting => "only controllers waiting for a device can be removed",
            Self::Invalid => "controller numbers start at 1",
        })
    }
}

impl std::error::Error for SlotError {}

#[derive(Debug)]
pub struct SlotTable {
    slots: BTreeMap<u16, Slot>,
    phones_can_create: bool,
    /// increments on every change, so listing pages know when to refresh
    version: u64,
}

impl Default for SlotTable {
    fn default() -> Self {
        Self::new()
    }
}

impl SlotTable {
    pub fn new() -> Self {
        Self {
            slots: BTreeMap::new(),
            phones_can_create: true,
            version: 0,
        }
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    fn changed(&mut self) {
        self.version += 1;
    }

    pub fn phones_can_create(&self) -> bool {
        self.phones_can_create
    }

    pub fn set_phones_can_create(&mut self, allowed: bool) {
        if self.phones_can_create != allowed {
            self.phones_can_create = allowed;
            self.changed();
        }
    }

    pub fn get(&self, number: u16) -> Option<&Slot> {
        self.slots.get(&number)
    }

    pub fn get_mut(&mut self, number: u16) -> Option<&mut Slot> {
        self.slots.get_mut(&number)
    }

    pub fn iter(&self) -> impl Iterator<Item = (u16, &Slot)> {
        self.slots.iter().map(|(n, s)| (*n, s))
    }

    /// The first number from 1 not in use.
    pub fn lowest_free(&self) -> u16 {
        let mut n = 1;
        for &used in self.slots.keys() {
            if used != n {
                break;
            }
            n += 1;
        }
        n
    }

    fn insert(&mut self, number: u16, slot: Slot) {
        self.slots.insert(number, slot);
        self.changed();
    }

    /// Creates a waiting slot at the lowest free number.
    pub fn create(&mut self) -> u16 {
        let n = self.lowest_free();
        self.insert(n, waiting());
        n
    }

    /// Creates a waiting slot at `number` if it is free.
    pub fn create_at(&mut self, number: u16) -> Result<(), SlotError> {
        if number == 0 {
            return Err(SlotError::Invalid);
        }
        if self.slots.contains_key(&number) {
            return Err(SlotError::Taken);
        }
        self.insert(number, waiting());
        Ok(())
    }

    /// Removes a slot that is still waiting for a device.
    pub fn remove(&mut self, number: u16) -> Result<(), SlotError> {
        match self.slots.get(&number) {
            None => Err(SlotError::NotFound),
            Some(slot) if slot.status != SlotStatus::Waiting => Err(SlotError::NotWaiting),
            Some(_) => {
                self.slots.remove(&number);
                self.changed();
                Ok(())
            }
        }
    }

    /// A device asks for slot `requested` (0 = a new controller).
    pub fn join(
        &mut self,
        requested: u16,
        device: DeviceId,
        conn: ConnId,
        now: SystemTime,
    ) -> Join {
        let number = match requested {
            0 if !self.phones_can_create => return Join::NotAllowed,
            0 => self.lowest_free(),
            n => n,
        };
        let connected = |since| Slot {
            status: SlotStatus::Connected,
            device: Some(device),
            conn: Some(conn),
            summary: None,
            connected_since: Some(since),
        };
        let Some(slot) = self.slots.get_mut(&number) else {
            if !self.phones_can_create {
                return Join::NotAllowed;
            }
            self.insert(number, connected(now));
            return Join::Joined {
                slot: number,
                resumed: false,
                replaced: None,
            };
        };
        let same_device = slot.device == Some(device);
        let joined = match slot.status {
            SlotStatus::Waiting => {
                *slot = connected(now);
                Join::Joined {
                    slot: number,
                    resumed: false,
                    replaced: None,
                }
            }
            SlotStatus::Connected if same_device => {
                let replaced = slot.conn.replace(conn);
                Join::Joined {
                    slot: number,
                    resumed: false,
                    replaced,
                }
            }
            SlotStatus::Held { .. } if same_device => {
                slot.status = SlotStatus::Connected;
                slot.conn = Some(conn);
                Join::Joined {
                    slot: number,
                    resumed: true,
                    replaced: None,
                }
            }
            SlotStatus::Connected | SlotStatus::Held { .. } => return Join::InUse { requested },
        };
        self.changed();
        joined
    }

    /// Connection `conn` of `number` was lost: the slot is held for its device until `until`.
    /// Returns false when `conn` no longer owns the slot (replaced or kicked).
    pub fn leave(&mut self, number: u16, conn: ConnId, until: Instant) -> bool {
        match self.slots.get_mut(&number) {
            Some(slot) if slot.conn == Some(conn) => {
                slot.status = SlotStatus::Held { until };
                slot.conn = None;
                self.changed();
                true
            }
            _ => false,
        }
    }

    /// Frees every held slot whose grace period is over; returns their numbers.
    pub fn expire(&mut self, now: Instant) -> Vec<u16> {
        let expired: Vec<u16> = self
            .slots
            .iter()
            .filter(|(_, s)| matches!(s.status, SlotStatus::Held { until } if until <= now))
            .map(|(n, _)| *n)
            .collect();
        for n in &expired {
            self.slots.remove(n);
        }
        if !expired.is_empty() {
            self.changed();
        }
        expired
    }

    /// Removes the player of `number` at once; returns the connection to tell, if any.
    pub fn kick(&mut self, number: u16) -> Result<Option<ConnId>, SlotError> {
        let slot = self.slots.remove(&number).ok_or(SlotError::NotFound)?;
        self.changed();
        Ok(slot.conn)
    }

    /// The controller list as seen by `device`.
    pub fn list(&self, device: Option<DeviceId>) -> Vec<ListEntry> {
        self.slots
            .iter()
            .map(|(&slot, s)| ListEntry {
                slot,
                status: match s.status {
                    SlotStatus::Waiting => ListStatus::Waiting,
                    SlotStatus::Connected => ListStatus::Connected,
                    SlotStatus::Held { .. } if device.is_some() && s.device == device => {
                        ListStatus::HeldForYou
                    }
                    SlotStatus::Held { .. } => ListStatus::Held,
                },
            })
            .collect()
    }
}

fn waiting() -> Slot {
    Slot {
        status: SlotStatus::Waiting,
        device: None,
        conn: None,
        summary: None,
        connected_since: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    const A: DeviceId = [1; 16];
    const B: DeviceId = [2; 16];
    const C: DeviceId = [3; 16];

    fn now() -> SystemTime {
        SystemTime::UNIX_EPOCH
    }

    fn joined(slot: u16) -> Join {
        Join::Joined {
            slot,
            resumed: false,
            replaced: None,
        }
    }

    #[test]
    fn new_controllers_take_the_lowest_free_number() {
        let mut t = SlotTable::new();
        assert_eq!(t.join(0, A, 1, now()), joined(1));
        assert_eq!(t.join(0, B, 2, now()), joined(2));
        assert_eq!(t.join(3, C, 3, now()), joined(3));
        t.kick(2).unwrap();
        assert_eq!(t.join(0, B, 4, now()), joined(2));
        assert_eq!(t.lowest_free(), 4);
    }

    #[test]
    fn a_free_number_can_be_opened_directly() {
        let mut t = SlotTable::new();
        assert_eq!(t.join(4, A, 1, now()), joined(4));
        assert_eq!(t.lowest_free(), 1);
    }

    #[test]
    fn waiting_slots_are_created_taken_and_removed() {
        let mut t = SlotTable::new();
        assert_eq!(t.create(), 1);
        assert_eq!(t.create_at(7), Ok(()));
        assert_eq!(t.create_at(7), Err(SlotError::Taken));
        assert_eq!(t.create_at(0), Err(SlotError::Invalid));
        assert_eq!(t.get(1).unwrap().status, SlotStatus::Waiting);
        // a new controller does not take a waiting slot: it gets the next free number
        assert_eq!(t.join(0, A, 1, now()), joined(2));
        assert_eq!(t.join(7, B, 2, now()), joined(7));
        assert_eq!(t.remove(7), Err(SlotError::NotWaiting));
        assert_eq!(t.remove(1), Ok(()));
        assert_eq!(t.remove(1), Err(SlotError::NotFound));
    }

    #[test]
    fn phones_may_be_prevented_from_creating_controllers() {
        let mut t = SlotTable::new();
        t.create_at(5).unwrap();
        t.set_phones_can_create(false);
        assert_eq!(t.join(0, A, 1, now()), Join::NotAllowed);
        assert_eq!(t.join(2, A, 1, now()), Join::NotAllowed);
        assert_eq!(t.join(5, A, 1, now()), joined(5));
    }

    #[test]
    fn another_device_gets_in_use_and_the_same_device_replaces_its_connection() {
        let mut t = SlotTable::new();
        t.join(1, A, 10, now());
        assert_eq!(t.join(1, B, 11, now()), Join::InUse { requested: 1 });
        assert_eq!(
            t.join(1, A, 12, now()),
            Join::Joined {
                slot: 1,
                resumed: false,
                replaced: Some(10)
            }
        );
        assert_eq!(t.get(1).unwrap().conn, Some(12));
        // the replaced connection cannot release the slot any more
        assert!(!t.leave(1, 10, Instant::now()));
    }

    #[test]
    fn a_held_slot_waits_for_its_device_and_then_is_freed() {
        let mut t = SlotTable::new();
        let start = Instant::now();
        t.join(1, A, 10, now());
        assert!(t.leave(1, 10, start + Duration::from_secs(60)));
        assert_eq!(t.join(1, B, 11, now()), Join::InUse { requested: 1 });
        assert_eq!(t.join(0, B, 11, now()), joined(2));
        assert!(t.expire(start + Duration::from_secs(59)).is_empty());
        assert_eq!(
            t.join(1, A, 12, now()),
            Join::Joined {
                slot: 1,
                resumed: true,
                replaced: None
            }
        );
        assert!(t.leave(1, 12, start + Duration::from_secs(60)));
        assert_eq!(t.expire(start + Duration::from_secs(60)), vec![1]);
        assert_eq!(t.lowest_free(), 1);
    }

    #[test]
    fn kicking_frees_the_number_at_once() {
        let mut t = SlotTable::new();
        t.join(1, A, 10, now());
        assert_eq!(t.kick(1), Ok(Some(10)));
        assert_eq!(t.kick(1), Err(SlotError::NotFound));
        assert_eq!(t.join(1, B, 11, now()), joined(1));
    }

    #[test]
    fn the_list_shows_each_status_and_the_slot_held_for_the_asking_device() {
        let mut t = SlotTable::new();
        t.join(1, A, 10, now());
        t.create_at(3).unwrap();
        t.join(2, B, 11, now());
        t.leave(2, 11, Instant::now());
        let status = |list: Vec<ListEntry>| {
            list.into_iter()
                .map(|e| (e.slot, e.status))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            status(t.list(Some(C))),
            vec![
                (1, ListStatus::Connected),
                (2, ListStatus::Held),
                (3, ListStatus::Waiting)
            ]
        );
        assert_eq!(status(t.list(Some(B)))[1], (2, ListStatus::HeldForYou));
        assert_eq!(status(t.list(None))[1], (2, ListStatus::Held));
    }

    #[test]
    fn the_version_changes_on_every_change() {
        let mut t = SlotTable::new();
        let v0 = t.version();
        t.create();
        let v1 = t.version();
        assert!(v1 > v0);
        t.set_phones_can_create(true); // unchanged
        assert_eq!(t.version(), v1);
        t.join(1, A, 1, now());
        assert!(t.version() > v1);
    }
}
