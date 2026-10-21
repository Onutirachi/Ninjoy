/** What the window shows and asks for; the Tauri app implements it (tests use a fake). */

export type Theme = "auto" | "dark" | "light";
export type Language = "auto" | "en" | "pt";

export interface Settings {
  theme: Theme;
  language: Language;
  holdSeconds: number;
  phonesCanCreate: boolean;
  startWithSystem: boolean;
}

export interface ControllerView {
  number: number;
  status: "waiting" | "connected" | "reconnecting";
  holdLeft: number | null;
  device: string | null;
  /** unix ms */
  connectedSince: number | null;
  rttMs: number | null;
  pad: "plugged" | "failed" | "unavailable";
  padError: string | null;
  gyro: boolean;
  lightbar: [number, number, number] | null;
  /** strong, weak 0–1 */
  rumble: [number, number] | null;
  url: string;
  nameUrl: string | null;
}

export interface Snapshot {
  addresses: { name: string | null; ips: string[]; securePort: number | null; plainPort: number };
  driver: { ok: boolean; backend: string | null; reason: string | null; fix: string | null };
  settings: Settings;
  controllers: ControllerView[];
}

export interface LiveView {
  buttons: number;
  sticks: [number, number, number, number];
  triggers: [number, number];
  gyro: boolean;
  /** [id, x 0–65535, y 0–65535] */
  touches: [number, number, number][];
  rate: [number, number, number] | null;
  accel: [number, number, number] | null;
}

export interface Bridge {
  snapshot(): Promise<Snapshot>;
  live(number: number): Promise<LiveView | null>;
  create(number?: number): Promise<number>;
  remove(number: number): Promise<void>;
  kick(number: number): Promise<void>;
  setSettings(settings: Settings): Promise<void>;
  qrSvg(text: string): Promise<string>;
  /** called when the snapshot changed; returns a function that stops listening */
  onChanged(listener: () => void): () => void;
  minimize(): void;
  toggleMaximize(): void;
  /** hides to the tray */
  close(): void;
}

/** The bridge to the Tauri app. */
export async function tauriBridge(): Promise<Bridge> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  return {
    snapshot: () => invoke<Snapshot>("snapshot"),
    live: (number) => invoke<LiveView | null>("live", { number }),
    create: (number) => invoke<number>("create", { number: number ?? null }),
    remove: (number) => invoke<void>("remove", { number }),
    kick: (number) => invoke<void>("kick", { number }),
    setSettings: (settings) => invoke<void>("set_settings", { settings }),
    qrSvg: (text) => invoke<string>("qr_svg", { text }),
    onChanged(listener) {
      const stop = listen("changed", () => listener());
      return () => void stop.then((f) => f());
    },
    minimize: () => void win.minimize(),
    toggleMaximize: () => void win.toggleMaximize(),
    close: () => void win.hide(),
  };
}
