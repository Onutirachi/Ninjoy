import { decodeHost, Encoder, toRawState, type HostMessage, type ListStatus, type RawState } from "../engine/protocol.ts";
import type { ControllerState } from "../engine/state.ts";

/** What the page shows for the connection (data-model.md, "Page connection status"). */
export type SessionStatus =
  | { kind: "list" }
  | { kind: "connecting" }
  | { kind: "joined"; slot: number }
  /** slot 0 = phones may not create controllers */
  | { kind: "in-use"; slot: number }
  | { kind: "opened-elsewhere"; slot: number }
  | { kind: "kicked" }
  | { kind: "unavailable" }
  | { kind: "update-needed" };

export interface SlotListEntry { slot: number; status: ListStatus }
export interface Feedback { rumble: [number, number] | null; lightbar: [number, number, number] | null }

/** Resend the current state this often while nothing changes. */
export const KEEPALIVE_MS = 250;
const RETRY_FIRST_MS = 250;
const RETRY_MAX_MS = 4000;

export interface SessionOptions {
  /** `ws(s)://host/ws` */
  url: string;
  device: Uint8Array;
  onStatus(status: SessionStatus): void;
  onList?(entries: SlotListEntry[], phonesCanCreate: boolean): void;
  onFeedback?(feedback: Feedback): void;
  /** round-trip time measured by the host, ms */
  onRtt?(ms: number): void;
  /** the host's skins or default skin changed */
  onSkinsChanged?(): void;
  /** injectable for tests */
  createSocket?: (url: string) => WebSocket;
  doc?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
}

/**
 * The page's side of the session: joins a slot (or shows the controller list), sends every
 * controller state, keeps the slot alive and reconnects by itself while the page is visible.
 */
export function createSession(o: SessionOptions) {
  const doc = o.doc ?? document;
  const encoder = new Encoder();
  let socket: WebSocket | null = null;
  /** slot to ask for on (re)connect; null = controller list */
  let want: number | null = null;
  let joined = 0;
  let seq = 0;
  let last: RawState | null = null;
  let lastSentAt = 0;
  let retryMs = RETRY_FIRST_MS;
  let retryTimer = 0;
  /** no automatic reconnect after kick, opened elsewhere or a version mismatch */
  let stopped = false;
  let status: SessionStatus = { kind: "connecting" };
  /** the skin this page uses, told to the host after every join ("" = the default) */
  let skin = "";

  const setStatus = (s: SessionStatus) => {
    status = s;
    o.onStatus(s);
  };
  const send = (bytes: Uint8Array<ArrayBuffer>) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(bytes);
  };
  const sendState = () => {
    if (!joined || !last) return;
    seq = (seq + 1) >>> 0;
    send(encoder.state(seq, last));
    lastSentAt = performance.now();
  };
  const greet = () => {
    if (want === null) send(encoder.list(o.device));
    else send(encoder.hello(want, o.device));
  };

  const onMessage = (message: HostMessage) => {
    switch (message.type) {
      case "welcome":
        joined = message.slot;
        want = message.slot; // reconnects ask for the same number
        retryMs = RETRY_FIRST_MS;
        setStatus({ kind: "joined", slot: joined });
        sendState();
        send(encoder.skin(skin));
        break;
      case "in-use":
        setStatus({ kind: "in-use", slot: message.requested });
        break;
      case "slot-list":
        o.onList?.(message.entries, message.phonesCanCreate);
        break;
      case "opened-elsewhere":
        stop({ kind: "opened-elsewhere", slot: joined });
        break;
      case "kicked":
        stop({ kind: "kicked" });
        break;
      case "version-mismatch":
        stop({ kind: "update-needed" });
        break;
      case "feedback":
        o.onFeedback?.({ rumble: message.rumble, lightbar: message.lightbar });
        break;
      case "ping":
        send(encoder.pong(message.nonce));
        if (message.lastRtt) o.onRtt?.(message.lastRtt / 10);
        break;
      case "skins-changed":
        o.onSkinsChanged?.();
        break;
    }
  };

  const stop = (s: SessionStatus) => {
    stopped = true;
    joined = 0;
    setStatus(s);
    socket?.close();
  };

  const connect = () => {
    clearTimeout(retryTimer);
    if (stopped || socket || doc.visibilityState === "hidden") return;
    if (status.kind !== "list" && status.kind !== "in-use") setStatus(joined ? { kind: "unavailable" } : { kind: "connecting" });
    const ws = (o.createSocket ?? ((url) => new WebSocket(url)))(o.url);
    ws.binaryType = "arraybuffer";
    socket = ws;
    ws.onopen = () => greet();
    ws.onmessage = (e) => {
      try {
        const message = decodeHost(e.data as ArrayBuffer);
        if (message) onMessage(message);
      } catch {
        ws.close(); // malformed: start over
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      const wasJoined = joined;
      joined = 0;
      if (stopped) return;
      if (wasJoined) setStatus({ kind: "unavailable" });
      else if (status.kind === "connecting") setStatus({ kind: "unavailable" });
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(RETRY_MAX_MS, retryMs * 2);
    };
  };

  const onVisibility = () => {
    if (doc.visibilityState === "hidden") {
      if (joined) send(encoder.hidden());
    } else {
      if (socket) sendState();
      else connect();
    }
  };
  doc.addEventListener("visibilitychange", onVisibility);

  const keepalive = window.setInterval(() => {
    if (joined && performance.now() - lastSentAt >= KEEPALIVE_MS - 5) sendState();
  }, KEEPALIVE_MS);

  return {
    get status() { return status; },
    get slot() { return joined; },
    /** Ask for a slot (0 = a new controller). */
    join(slot: number) {
      want = slot;
      stopped = false;
      if (status.kind !== "joined") setStatus({ kind: "connecting" });
      if (socket?.readyState === WebSocket.OPEN) greet();
      else connect();
    },
    /** Show the controller list (bare address). */
    list() {
      want = null;
      stopped = false;
      setStatus({ kind: "list" });
      if (socket?.readyState === WebSocket.OPEN) greet();
      else connect();
    },
    /** The skin this page uses ("" = the host's default); the host is told now and on every join. */
    setSkin(id: string) {
      skin = id;
      if (joined) send(encoder.skin(id));
    },
    /** Sends a new controller state at once (call on every change). */
    send(state: ControllerState) {
      last = toRawState(state);
      sendState();
    },
    close() {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(keepalive);
      doc.removeEventListener("visibilitychange", onVisibility);
      socket?.close();
      socket = null;
    },
  };
}

export type Session = ReturnType<typeof createSession>;

/** WebSocket address of the host that served this page. */
export function sessionUrl(location: Location = window.location): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

/** Slot number in the address (`/3` → 3); 0 for the bare address. */
export function slotFromPath(pathname: string): number {
  const n = Number(pathname.replace(/^\/+|\/+$/g, ""));
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : 0;
}
