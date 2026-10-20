import { afterEach, describe, expect, it } from "vitest";
import { createI18n } from "../../src/i18n/index.ts";
import { StateBuilder } from "../../src/engine/state.ts";
import { createSession, slotFromPath, type SessionStatus } from "../../src/platform/session.ts";
import { renderLobby } from "../../src/ui/lobby.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const device = Uint8Array.from({ length: 16 }, (_, i) => i + 1);

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  binaryType = "";
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(bytes: Uint8Array) {
    this.sent.push(new Uint8Array(bytes));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(...bytes: number[]) {
    this.onmessage?.({ data: Uint8Array.from(bytes).buffer });
  }
  types() {
    return this.sent.map((b) => b[0]);
  }
}

function fakeDoc() {
  const listeners = new Set<() => void>();
  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    set(v: DocumentVisibilityState) {
      this.visibilityState = v;
      for (const l of listeners) l();
    },
  };
}

function start(extra: Partial<Parameters<typeof createSession>[0]> = {}) {
  FakeSocket.all = [];
  const statuses: SessionStatus[] = [];
  const doc = fakeDoc();
  const session = createSession({
    url: "ws://host/ws",
    device,
    onStatus: (s) => statuses.push(s),
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
    doc: doc as never,
    ...extra,
  });
  const socket = () => FakeSocket.all.at(-1)!;
  return { session, statuses, doc, socket };
}

const welcome = (slot: number) => [0x81, 1, slot & 0xff, slot >> 8];

describe("session client", () => {
  let current: ReturnType<typeof start> | undefined;
  afterEach(() => current?.session.close());

  it("joins the slot of the address and sends every state change", () => {
    current = start();
    const { session, statuses, socket } = current;
    session.join(3);
    socket().open();
    expect([...socket().sent[0]!]).toEqual([0x01, 1, 3, 0, ...device]);
    socket().receive(...welcome(3));
    expect(statuses.at(-1)).toEqual({ kind: "joined", slot: 3 });
    const b = new StateBuilder();
    b.press("cross");
    session.send(b.publish(1));
    b.press("circle");
    session.send(b.publish(2));
    const states = socket().sent.filter((m) => m[0] === 0x02);
    expect(states).toHaveLength(2);
    const view = (m: Uint8Array) => new DataView(m.buffer);
    expect(view(states[0]!).getUint32(1, true)).toBe(1);
    expect(view(states[1]!).getUint32(1, true)).toBe(2);
    expect(view(states[1]!).getUint32(5, true)).toBe(0b11);
  });

  it("shows the controller list at the bare address and joins from it on the same connection", () => {
    const lists: unknown[] = [];
    current = start({ onList: (entries, can) => lists.push({ entries, can }) });
    const { session, statuses, socket } = current;
    session.list();
    socket().open();
    expect([...socket().sent[0]!]).toEqual([0x05, ...device]);
    socket().receive(0x88, 1, 2, 1, 0, 1, 2, 0, 0);
    expect(lists).toEqual([{ entries: [{ slot: 1, status: "connected" }, { slot: 2, status: "waiting" }], can: true }]);
    expect(statuses.at(-1)).toEqual({ kind: "list" });
    session.join(2);
    expect([...socket().sent.at(-1)!.subarray(0, 4)]).toEqual([0x01, 1, 2, 0]);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("resends the current state while idle and reports a hidden page", async () => {
    current = start();
    const { session, doc, socket } = current;
    session.join(1);
    socket().open();
    socket().receive(...welcome(1));
    session.send(new StateBuilder().publish(1));
    const count = () => socket().types().filter((t) => t === 0x02).length;
    const before = count();
    await wait(560);
    expect(count() - before).toBeGreaterThanOrEqual(2);
    doc.set("hidden");
    expect(socket().types().at(-1)).toBe(0x03);
  });

  it("reconnects to the same slot with growing delays while visible", async () => {
    current = start();
    const { session, statuses, doc, socket } = current;
    session.join(0);
    socket().open();
    socket().receive(...welcome(4));
    socket().close();
    expect(statuses.at(-1)).toEqual({ kind: "unavailable" });
    await wait(300);
    expect(FakeSocket.all).toHaveLength(2);
    socket().open();
    expect([...socket().sent[0]!.subarray(0, 4)]).toEqual([0x01, 1, 4, 0]); // asks for its own number again
    socket().close();
    await wait(300);
    expect(FakeSocket.all).toHaveLength(2); // second retry waits 500 ms
    await wait(300);
    expect(FakeSocket.all).toHaveLength(3);
    // no retries while hidden
    doc.set("hidden");
    socket().close();
    await wait(1100);
    expect(FakeSocket.all).toHaveLength(3);
    doc.set("visible");
    expect(FakeSocket.all).toHaveLength(4);
  });

  it("answers pings, reports the round-trip time and stops after a kick", async () => {
    const rtts: number[] = [];
    current = start({ onRtt: (ms) => rtts.push(ms) });
    const { session, statuses, socket } = current;
    session.join(1);
    socket().open();
    socket().receive(...welcome(1));
    socket().receive(0x87, 7, 0, 0, 0, 125, 0); // nonce 7, last RTT 12.5 ms
    expect([...socket().sent.at(-1)!]).toEqual([0x04, 7, 0, 0, 0]);
    expect(rtts).toEqual([12.5]);
    socket().receive(0x84);
    expect(statuses.at(-1)).toEqual({ kind: "kicked" });
    await wait(400);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("reports in-use, opened elsewhere and version mismatch", () => {
    current = start();
    const { session, statuses, socket } = current;
    session.join(2);
    socket().open();
    socket().receive(0x82, 2, 0);
    expect(statuses.at(-1)).toEqual({ kind: "in-use", slot: 2 });
    socket().receive(...welcome(5));
    socket().receive(0x83);
    expect(statuses.at(-1)).toEqual({ kind: "opened-elsewhere", slot: 5 });
    current.session.close();
    current = start();
    current.session.join(1);
    current.socket().open();
    current.socket().receive(0x85, 2);
    expect(current.statuses.at(-1)).toEqual({ kind: "update-needed" });
  });

  it("reads the slot from the address", () => {
    expect(slotFromPath("/")).toBe(0);
    expect(slotFromPath("/3")).toBe(3);
    expect(slotFromPath("/3/")).toBe(3);
    expect(slotFromPath("/abc")).toBe(0);
    expect(slotFromPath("/70000")).toBe(0);
  });
});

describe("controller list", () => {
  const i18n = createI18n("en");

  it("shows this device's controller first, then available ones, then the ones in use", () => {
    const picked: number[] = [];
    const list = renderLobby({
      i18n,
      phonesCanCreate: true,
      entries: [
        { slot: 1, status: "connected" },
        { slot: 2, status: "held-for-you" },
        { slot: 3, status: "waiting" },
        { slot: 4, status: "held" },
      ],
      onPick: (n) => picked.push(n),
    });
    const cards = [...list.querySelectorAll<HTMLButtonElement>(".nj-lobby-card")];
    expect(cards.map((c) => c.textContent)).toEqual([
      "2Back to controller 2Available",
      "3Controller 3Available",
      "1Controller 1In use",
      "4Controller 4In use",
      "+New controller",
    ]);
    expect(cards.map((c) => c.disabled)).toEqual([false, false, true, true, false]);
    cards[1]!.click();
    cards[4]!.click();
    cards[2]!.click(); // in use: nothing
    expect(picked).toEqual([3, 0]);
  });

  it("hides the new controller button when the host does not allow it", () => {
    const list = renderLobby({ i18n, phonesCanCreate: false, entries: [], onPick: () => {} });
    expect(list.querySelector(".new")).toBeNull();
    expect(list.textContent).toContain("Ask the host to create one");
  });
});
