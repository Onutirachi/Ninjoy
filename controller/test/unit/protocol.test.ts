import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeHost, Encoder, ProtocolError, toRawState, type RawState } from "../../src/engine/protocol.ts";
import { StateBuilder } from "../../src/engine/state.ts";

// The same vectors the Rust codec is tested against.
const vectors = JSON.parse(readFileSync(new URL("../../../host/session/tests/vectors.json", import.meta.url), "utf8"));
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

describe("page messages (shared vectors)", () => {
  const encoder = new Encoder();
  for (const { name, message: m, hex: expected } of vectors.page) {
    it(name, () => {
      const bytes = {
        hello: () => encoder.hello(m.slot, fromHex(m.device)),
        state: () => encoder.state(m.seq, m as RawState),
        hidden: () => encoder.hidden(),
        list: () => encoder.list(fromHex(m.device)),
        pong: () => encoder.pong(m.nonce),
        skin: () => encoder.skin(m.id),
      }[m.type as string]!();
      expect(hex(bytes)).toBe(expected);
    });
  }
});

describe("host messages (shared vectors)", () => {
  for (const { name, message, hex: bytes } of vectors.host) {
    it(name, () => expect(decodeHost(fromHex(bytes))).toEqual(message));
  }

  it("ignores unknown types and rejects malformed messages", () => {
    expect(decodeHost(Uint8Array.of(0x7f, 1))).toBeNull();
    expect(() => decodeHost(Uint8Array.of(0x81, 1))).toThrow(ProtocolError);
    expect(() => decodeHost(new Uint8Array())).toThrow(ProtocolError);
    expect(() => decodeHost(Uint8Array.of(0x88, 1, 1, 1, 0, 9))).toThrow(ProtocolError);
  });
});

describe("toRawState", () => {
  it("converts the touch-engine state to wire units", () => {
    const b = new StateBuilder();
    b.press("cross");
    b.press("l1");
    b.press("touchpad");
    b.stick("left", 1, -1);
    b.stick("right", -0.5, 0.25);
    b.trigger("r2", 0.5);
    b.setTouches([{ id: 300, x: 0.25, y: 1 }]);
    const raw = toRawState(b.publish(1));
    expect(raw.buttons).toBe((1 << 0) | (1 << 8) | (1 << 11) | (1 << 17));
    expect(raw.sticks).toEqual([32767, -32767, -16383, 8192]); // Math.round(-16383.5) = -16383
    expect(raw.triggers).toEqual([0, 128]);
    expect(raw.touches).toEqual([{ id: 300 & 0x7f, x: 16384, y: 65535 }]);
    expect(raw.motion).toBeNull();
  });

  it("sends motion only while gyro is on", () => {
    const b = new StateBuilder();
    b.setGyro(true);
    b.setMotion({ rate: { x: 1, y: 2, z: 3 }, accel: { x: 4, y: 5, z: 6 }, time: 0 });
    expect(toRawState(b.publish(1)).motion).toEqual({ rate: [1, 2, 3], accel: [4, 5, 6] });
    b.setGyro(false);
    expect(toRawState(b.publish(2)).motion).toBeNull();
  });

  it("reuses one buffer", () => {
    const encoder = new Encoder();
    const a = encoder.hidden();
    const c = encoder.pong(1);
    expect(a.buffer).toBe(c.buffer);
  });
});
