/** What the window shows and asks for; the Tauri app implements it (tests use a fake). */

export type Theme = "auto" | "dark" | "light";
export type Language = "auto" | "en" | "pt";

/** Automatic: the standard ports with their alternates; Custom: exactly these. */
export interface PortsSetting {
  mode: "automatic" | "custom";
  secure: number;
  plain: number;
}

/** Linux start screen and touchpad choices. */
export interface SetupPrefs {
  /** "Continue anyway": the start screen opens only for a missing Critical item */
  skippedRecommended: boolean;
  /** the controllers' touchpad stays a desktop mouse */
  touchpadMouse: boolean;
  /** Recommended items the user chose to ignore: they no longer count as missing */
  ignored: SetupItem["id"][];
}

export interface Settings {
  theme: Theme;
  language: Language;
  holdSeconds: number;
  phonesCanCreate: boolean;
  startWithSystem: boolean;
  closeToTray: boolean;
  /** the skin phones use unless they pick their own */
  defaultSkin: string;
  ports: PortsSetting;
  setup: SetupPrefs;
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
  /** the skin the phone uses (its own choice or the default) */
  skin: string | null;
}

export interface SkinView {
  id: string;
  name: string;
  author: string;
  version: string;
  format: number;
  bundled: boolean;
  preview: string | null;
  files: string[];
  /** why phones are not offered it */
  broken: string | null;
  isDefault: boolean;
}

/** One system change Ninjoy needs on Linux. */
export interface SetupItem {
  id: "controllers" | "touchpad" | "ports" | "firewall";
  state: "done" | "missing" | "failed";
  /** Critical (controllers, firewall) or Recommended */
  critical: boolean;
  /** raw command output when it failed */
  reason: string | null;
  /** the commands to run by hand */
  commands: string[];
  firewall: "ufw" | "firewalld" | null;
}

export interface SetupView {
  items: SetupItem[];
  ready: boolean;
  /** the last Configure, when it did not run */
  outcome: "cancelled" | "noPrompt" | null;
  /** every item still to do, as commands to copy */
  allCommands: string;
}

export interface SettingsResult {
  /** the phone servers moved: phones must scan their QR code again */
  portsMoved: boolean;
}

export interface SetupConfigureResult {
  setup: SetupView | null;
  /** the phone servers moved: phones must scan their QR code again */
  portsMoved: boolean;
}

export interface Snapshot {
  addresses: { name: string | null; ips: string[]; securePort: number | null; plainPort: number };
  driver: { ok: boolean; backend: string | null; reason: string | null; fix: string | null };
  settings: Settings;
  controllers: ControllerView[];
  skins: SkinView[];
  /** the Linux setup; null on other systems */
  setup: SetupView | null;
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
  /** saves the settings; a ports change moves the phone servers, or fails naming the port */
  setSettings(settings: Settings): Promise<SettingsResult>;
  qrSvg(text: string): Promise<string>;
  /** checks the Linux setup items again (null on other systems) */
  setupCheck(): Promise<SetupView | null>;
  /** applies the missing Linux setup items (all, or only `items`); resolves once the password prompt is answered */
  setupConfigure(items: SetupItem["id"][] | null): Promise<SetupConfigureResult>;
  /** makes the controllers' touchpad a desktop mouse (`on`) or not; one password prompt */
  setupTouchpadMouse(on: boolean): Promise<SetupConfigureResult>;
  /** a file of a skin in the library */
  skinFile(id: string, path: string): Promise<Uint8Array>;
  /** skins the window found broken (id → reason) */
  setBrokenSkins(broken: Record<string, string>): Promise<void>;
  /** called when the snapshot changed; returns a function that stops listening */
  onChanged(listener: () => void): () => void;
  minimize(): void;
  toggleMaximize(): void;
  /** closes the window: the app hides it to the tray or quits, as the settings say */
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
    setSettings: (settings) => invoke<SettingsResult>("set_settings", { settings }),
    qrSvg: (text) => invoke<string>("qr_svg", { text }),
    setupCheck: () => invoke<SetupView | null>("setup_check"),
    setupConfigure: (items) => invoke<SetupConfigureResult>("setup_configure", { items }),
    setupTouchpadMouse: (on) => invoke<SetupConfigureResult>("setup_touchpad_mouse", { on }),
    skinFile: async (id, path) => new Uint8Array(await invoke<ArrayBuffer>("skin_file", { id, path })),
    setBrokenSkins: (broken) => invoke<void>("set_broken_skins", { broken }),
    onChanged(listener) {
      const stop = listen("changed", () => listener());
      return () => void stop.then((f) => f());
    },
    minimize: () => void win.minimize(),
    toggleMaximize: () => void win.toggleMaximize(),
    close: () => void win.close(),
  };
}
