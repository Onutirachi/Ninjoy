"""Independent encoder of the wire protocol (specs/…-lan-controller-session/contracts/protocol.md).

Regenerates the shared test vectors: python host/session/tests/make_vectors.py host/session/tests/vectors.json
"""
import json
import struct
import sys

out = sys.argv[1]
device = bytes(range(0x10, 0x20))


def hello(m):
    return struct.pack("<BBH", 0x01, m["version"], m["slot"]) + bytes.fromhex(m["device"])


def state(m):
    flags = (1 if m["gyro"] else 0) | (2 if m["motion"] else 0) | (len(m["touches"]) << 2)
    b = struct.pack("<BII4h2BBB", 0x02, m["seq"], m["buttons"], *m["sticks"], *m["triggers"], flags, 0)
    for t in m["touches"]:
        b += struct.pack("<BHH", t["id"], t["x"], t["y"])
    if m["motion"]:
        b += struct.pack("<6f", *m["motion"]["rate"], *m["motion"]["accel"])
    return b


page = [
    ("hello-any", {"type": "hello", "version": 1, "slot": 0, "device": device.hex()}, hello),
    ("hello-slot-3", {"type": "hello", "version": 1, "slot": 3, "device": device.hex()}, hello),
    ("state-buttons", {"type": "state", "seq": 7, "buttons": (1 << 0) | (1 << 8) | (1 << 17), "sticks": [32767, -32767, 0, 1234],
                       "triggers": [255, 128], "gyro": False, "touches": [], "motion": None}, state),
    ("state-touches-motion", {"type": "state", "seq": 0xFFFFFFFE, "buttons": 0, "sticks": [0, 0, -16384, 16384], "triggers": [0, 0],
                              "gyro": True, "touches": [{"id": 4, "x": 16384, "y": 32768}, {"id": 9, "x": 65535, "y": 0}],
                              "motion": {"rate": [1.5, -2.25, 0.5], "accel": [0.0, 9.75, -1.0]}}, state),
    ("hidden", {"type": "hidden"}, lambda m: bytes([0x03])),
    ("pong", {"type": "pong", "nonce": 0xA1B2C3D4}, lambda m: struct.pack("<BI", 0x04, m["nonce"])),
    ("list", {"type": "list", "device": device.hex()}, lambda m: bytes([0x05]) + bytes.fromhex(m["device"])),
    ("skin", {"type": "skin", "id": "ninjoy-arcade"}, lambda m: bytes([0x06, len(m["id"].encode())]) + m["id"].encode()),
    ("skin-default", {"type": "skin", "id": ""}, lambda m: bytes([0x06, 0])),
]

host = [
    ("welcome", {"type": "welcome", "version": 1, "slot": 12}, lambda m: struct.pack("<BBH", 0x81, m["version"], m["slot"])),
    ("in-use", {"type": "in-use", "requested": 2}, lambda m: struct.pack("<BH", 0x82, m["requested"])),
    ("in-use-not-allowed", {"type": "in-use", "requested": 0}, lambda m: struct.pack("<BH", 0x82, 0)),
    ("opened-elsewhere", {"type": "opened-elsewhere"}, lambda m: bytes([0x83])),
    ("kicked", {"type": "kicked"}, lambda m: bytes([0x84])),
    ("version-mismatch", {"type": "version-mismatch", "hostVersion": 1}, lambda m: bytes([0x85, 1])),
    ("feedback-rumble", {"type": "feedback", "rumble": [255, 64], "lightbar": None}, lambda m: bytes([0x86, 1, 255, 64, 0, 0, 0])),
    ("feedback-lightbar", {"type": "feedback", "rumble": None, "lightbar": [255, 0, 128]}, lambda m: bytes([0x86, 2, 0, 0, 255, 0, 128])),
    ("feedback-both", {"type": "feedback", "rumble": [10, 20], "lightbar": [1, 2, 3]}, lambda m: bytes([0x86, 3, 10, 20, 1, 2, 3])),
    ("slot-list", {"type": "slot-list", "phonesCanCreate": True, "entries": [{"slot": 1, "status": "connected"}, {"slot": 3, "status": "waiting"}, {"slot": 300, "status": "held-for-you"}]},
     lambda m: bytes([0x88, 1, 3]) + struct.pack("<HBHBHB", 1, 1, 3, 0, 300, 3)),
    ("slot-list-empty", {"type": "slot-list", "phonesCanCreate": False, "entries": []}, lambda m: bytes([0x88, 0, 0])),
    ("ping", {"type": "ping", "nonce": 42, "lastRtt": 123}, lambda m: struct.pack("<BIH", 0x87, 42, 123)),
    ("skins-changed", {"type": "skins-changed"}, lambda m: bytes([0x89])),
]

doc = {
    "comment": "Shared wire-protocol test vectors (contracts/protocol.md). Rust and TypeScript codecs must encode each message to `hex` and decode `hex` back to `message`.",
    "protocolVersion": 1,
    "page": [{"name": n, "message": m, "hex": f(m).hex()} for n, m, f in page],
    "host": [{"name": n, "message": m, "hex": f(m).hex()} for n, m, f in host],
}
open(out, "w", encoding="utf8", newline="\n").write(json.dumps(doc, indent=2) + "\n")
print("ok", len(doc["page"]), len(doc["host"]))
