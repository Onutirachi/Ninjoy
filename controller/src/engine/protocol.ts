import { DS4_BUTTONS, type ControllerState } from "./state.ts";

/**
 * Wire protocol v1 between this page and the host (specs/…-lan-controller-session/contracts/protocol.md).
 * Little-endian; the first byte is the message type.
 */
export const PROTOCOL_VERSION = 1;

const HELLO = 0x01, STATE = 0x02, HIDDEN = 0x03, PONG = 0x04, LIST = 0x05, SKIN = 0x06;
const WELCOME = 0x81, IN_USE = 0x82, OPENED_ELSEWHERE = 0x83, KICKED = 0x84, VERSION_MISMATCH = 0x85;
const FEEDBACK = 0x86, PING = 0x87, SLOT_LIST = 0x88, SKINS_CHANGED = 0x89;
/** Longest skin id (bytes) in a SKIN message. */
const MAX_SKIN_ID = 64;

/** A STATE as it travels: integers in wire units. */
export interface RawState {
  buttons: number;
  /** lx, ly, rx, ry in −32767…32767 */
  sticks: [number, number, number, number];
  /** l2, r2 in 0…255 */
  triggers: [number, number];
  gyro: boolean;
  /** up to 2; x/y in 0…65535 */
  touches: { id: number; x: number; y: number }[];
  motion: { rate: [number, number, number]; accel: [number, number, number] } | null;
}

export type ListStatus = "waiting" | "connected" | "held" | "held-for-you";
const LIST_STATUS: ListStatus[] = ["waiting", "connected", "held", "held-for-you"];

export type HostMessage =
  | { type: "welcome"; version: number; slot: number }
  /** requested 0 = phones may not create controllers */
  | { type: "in-use"; requested: number }
  | { type: "opened-elsewhere" }
  | { type: "kicked" }
  | { type: "version-mismatch"; hostVersion: number }
  | { type: "feedback"; rumble: [number, number] | null; lightbar: [number, number, number] | null }
  | { type: "slot-list"; phonesCanCreate: boolean; entries: { slot: number; status: ListStatus }[] }
  /** lastRtt in 0.1 ms units, 0 = unknown */
  | { type: "ping"; nonce: number; lastRtt: number }
  /** the host's skins or default skin changed */
  | { type: "skins-changed" };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Touch-engine state → wire units. */
export function toRawState(state: ControllerState): RawState {
  let buttons = 0;
  DS4_BUTTONS.forEach((b, i) => {
    if (state.buttons.has(b)) buttons |= 1 << i;
  });
  const axis = (v: number) => Math.round(clamp(v, -1, 1) * 32767);
  const unit = (v: number, max: number) => Math.round(clamp(v, 0, 1) * max);
  const { left, right } = state.sticks;
  const m = state.gyro ? state.motion : null;
  return {
    buttons: buttons >>> 0,
    sticks: [axis(left.x), axis(left.y), axis(right.x), axis(right.y)],
    triggers: [unit(state.triggers.l2, 255), unit(state.triggers.r2, 255)],
    gyro: state.gyro,
    // DS4 touch ids are small counters; pointer ids can be large
    touches: state.touchpad.touches.slice(0, 2).map((t) => ({ id: t.id & 0x7f, x: unit(t.x, 65535), y: unit(t.y, 65535) })),
    motion: m ? { rate: [m.rate.x, m.rate.y, m.rate.z], accel: [m.accel.x, m.accel.y, m.accel.z] } : null,
  };
}

/**
 * Encodes page messages into one reused buffer. Each method returns a view of that buffer,
 * valid until the next call (WebSocket.send copies it).
 */
export class Encoder {
  private readonly bytes: Uint8Array<ArrayBuffer> = new Uint8Array(128);
  private readonly view = new DataView(this.bytes.buffer);

  hello(slot: number, device: Uint8Array): Uint8Array<ArrayBuffer> {
    this.bytes[0] = HELLO;
    this.bytes[1] = PROTOCOL_VERSION;
    this.view.setUint16(2, slot, true);
    this.bytes.set(device.subarray(0, 16), 4);
    return this.bytes.subarray(0, 20);
  }

  state(seq: number, s: RawState): Uint8Array<ArrayBuffer> {
    const v = this.view;
    const touches = Math.min(2, s.touches.length);
    v.setUint8(0, STATE);
    v.setUint32(1, seq >>> 0, true);
    v.setUint32(5, s.buttons >>> 0, true);
    s.sticks.forEach((value, i) => v.setInt16(9 + i * 2, value, true));
    v.setUint8(17, s.triggers[0]);
    v.setUint8(18, s.triggers[1]);
    v.setUint8(19, (s.gyro ? 1 : 0) | (s.motion ? 2 : 0) | (touches << 2));
    v.setUint8(20, 0);
    let at = 21;
    for (let i = 0; i < touches; i++) {
      const t = s.touches[i]!;
      v.setUint8(at, t.id);
      v.setUint16(at + 1, t.x, true);
      v.setUint16(at + 3, t.y, true);
      at += 5;
    }
    if (s.motion) {
      for (const f of [...s.motion.rate, ...s.motion.accel]) {
        v.setFloat32(at, f, true);
        at += 4;
      }
    }
    return this.bytes.subarray(0, at);
  }

  hidden(): Uint8Array<ArrayBuffer> {
    this.bytes[0] = HIDDEN;
    return this.bytes.subarray(0, 1);
  }

  list(device: Uint8Array): Uint8Array<ArrayBuffer> {
    this.bytes[0] = LIST;
    this.bytes.set(device.subarray(0, 16), 1);
    return this.bytes.subarray(0, 17);
  }

  pong(nonce: number): Uint8Array<ArrayBuffer> {
    this.bytes[0] = PONG;
    this.view.setUint32(1, nonce >>> 0, true);
    return this.bytes.subarray(0, 5);
  }

  /** The skin this page uses ("" = the host's default). */
  skin(id: string): Uint8Array<ArrayBuffer> {
    const text = new TextEncoder().encode(id).subarray(0, MAX_SKIN_ID);
    this.bytes[0] = SKIN;
    this.bytes[1] = text.length;
    this.bytes.set(text, 2);
    return this.bytes.subarray(0, 2 + text.length);
  }
}

export class ProtocolError extends Error {}

/** Decodes a host message; null for unknown types (ignored), throws on malformed ones. */
export function decodeHost(data: ArrayBuffer | Uint8Array): HostMessage | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = (n: number) => {
    if (bytes.length !== n) throw new ProtocolError(`message 0x${bytes[0]?.toString(16)} has ${bytes.length} bytes, expected ${n}`);
  };
  if (!bytes.length) throw new ProtocolError("empty message");
  switch (bytes[0]) {
    case WELCOME: len(4); return { type: "welcome", version: v.getUint8(1), slot: v.getUint16(2, true) };
    case IN_USE: len(3); return { type: "in-use", requested: v.getUint16(1, true) };
    case OPENED_ELSEWHERE: len(1); return { type: "opened-elsewhere" };
    case KICKED: len(1); return { type: "kicked" };
    case VERSION_MISMATCH: len(2); return { type: "version-mismatch", hostVersion: v.getUint8(1) };
    case FEEDBACK: {
      len(7);
      const flags = v.getUint8(1);
      return {
        type: "feedback",
        rumble: flags & 1 ? [v.getUint8(2), v.getUint8(3)] : null,
        lightbar: flags & 2 ? [v.getUint8(4), v.getUint8(5), v.getUint8(6)] : null,
      };
    }
    case SLOT_LIST: {
      if (bytes.length < 3) throw new ProtocolError("short controller list");
      const n = v.getUint8(2);
      len(3 + 3 * n);
      const entries: { slot: number; status: ListStatus }[] = [];
      for (let i = 0; i < n; i++) {
        const status = LIST_STATUS[v.getUint8(5 + i * 3)];
        if (!status) throw new ProtocolError("unknown slot status");
        entries.push({ slot: v.getUint16(3 + i * 3, true), status });
      }
      return { type: "slot-list", phonesCanCreate: (v.getUint8(1) & 1) !== 0, entries };
    }
    case PING: len(7); return { type: "ping", nonce: v.getUint32(1, true), lastRtt: v.getUint16(5, true) };
    case SKINS_CHANGED: len(1); return { type: "skins-changed" };
    default: return null;
  }
}
