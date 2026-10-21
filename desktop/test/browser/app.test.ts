import { afterEach, describe, expect, it } from "vitest";
import { createApp, type App } from "../../src/app.ts";
import type { Bridge, ControllerView, LiveView, Settings, Snapshot } from "../../src/bridge.ts";
import { latencyStats } from "../../src/details.ts";
import "../../src/styles.css";

const NOW = Date.UTC(2026, 9, 20, 20, 0, 0);

function controller(number: number, patch: Partial<ControllerView> = {}): ControllerView {
  return {
    number,
    status: "waiting",
    holdLeft: null,
    device: null,
    connectedSince: null,
    rttMs: null,
    pad: "plugged",
    padError: null,
    gyro: false,
    lightbar: null,
    rumble: null,
    url: `https://192.168.0.10:8443/${number}`,
    nameUrl: `https://ninjoy.local:8443/${number}`,
    ...patch,
  };
}

/** A fake app behind the window. */
class FakeBridge implements Bridge {
  snap: Snapshot = {
    addresses: { name: "ninjoy.local", ips: ["192.168.0.10"], securePort: 8443, plainPort: 8080 },
    driver: { ok: true, backend: "ViGEmBus", reason: null, fix: null },
    settings: { theme: "auto", language: "en", holdSeconds: 60, phonesCanCreate: true, startWithSystem: false, closeToTray: true },
    controllers: [],
  };
  liveState: LiveView | null = null;
  calls: string[] = [];
  saved: Settings[] = [];
  listeners: (() => void)[] = [];
  async snapshot() {
    return structuredClone(this.snap);
  }
  async live() {
    return this.liveState;
  }
  async create(number?: number) {
    let n = number ?? 1;
    while (this.snap.controllers.some((c) => c.number === n)) n++;
    this.snap.controllers.push(controller(n));
    this.snap.controllers.sort((a, b) => a.number - b.number);
    this.calls.push(`create ${n}`);
    return n;
  }
  async remove(number: number) {
    this.calls.push(`remove ${number}`);
  }
  async kick(number: number) {
    this.calls.push(`kick ${number}`);
  }
  async setSettings(settings: Settings) {
    this.saved.push(settings);
    this.snap.settings = settings;
  }
  async qrSvg(text: string) {
    return `<svg data-text="${text}"></svg>`;
  }
  onChanged(listener: () => void) {
    this.listeners.push(listener);
    return () => {};
  }
  minimize() {
    this.calls.push("minimize");
  }
  toggleMaximize() {
    this.calls.push("maximize");
  }
  close() {
    this.calls.push("close");
  }
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const text = (root: HTMLElement, selector: string) => root.querySelector(selector)?.textContent ?? "";

describe("desktop window", () => {
  let app: App;
  let root: HTMLElement;
  let bridge: FakeBridge;

  const start = async (setup?: (b: FakeBridge) => void) => {
    bridge = new FakeBridge();
    setup?.(bridge);
    root = document.createElement("div");
    root.style.cssText = "position:fixed;inset:0";
    document.body.append(root);
    app = await createApp(root, bridge, { timers: false, now: () => NOW, systemLanguages: ["en-US"] });
  };
  afterEach(() => {
    app.dispose();
    root.remove();
    delete document.documentElement.dataset.theme;
  });

  it("starts empty and creates a selected controller with its QR code and addresses", async () => {
    await start();
    expect(text(root, ".empty-view h2")).toBe("No controllers");
    expect(text(root, ".chip code")).toBe("ninjoy.local");
    expect(text(root, ".titlebar")).toContain("Driver OK");
    root.querySelector<HTMLButtonElement>(".create")!.click();
    await settle();
    expect(bridge.calls).toEqual(["create 1"]);
    const item = root.querySelector<HTMLElement>('.item[data-n="1"]')!;
    expect(item.getAttribute("aria-selected")).toBe("true");
    expect(text(item, ".name")).toBe("Waiting for a phone");
    expect(text(root, ".waiting-view h1")).toBe("Scan with your phone");
    expect(root.querySelector(".waiting-view .qr svg")!.getAttribute("data-text")).toBe("https://192.168.0.10:8443/1");
    expect(text(root, ".waiting-view .addr")).toBe("192.168.0.10:8443/1ninjoy.local:8443/1");
    root.querySelector<HTMLButtonElement>(".detail-head .danger")!.click();
    expect(bridge.calls.at(-1)).toBe("remove 1");
  });

  it("shows connected and reconnecting controllers and kicks", async () => {
    await start((b) => {
      b.snap.controllers = [
        controller(1, { status: "connected", device: "Galaxy S23 · Chrome", rttMs: 6.2, connectedSince: NOW - 12 * 60000, lightbar: [48, 153, 232] }),
        controller(2, { status: "reconnecting", device: "iPhone 15 · Safari", holdLeft: 42 }),
      ];
    });
    const [first, second] = root.querySelectorAll<HTMLElement>(".item");
    expect(text(first!, ".name")).toBe("Galaxy S23 · Chrome");
    expect(text(first!, ".sub")).toContain("6 ms");
    expect(first!.querySelector(".bars")!.getAttribute("data-q")).toBe("3");
    expect(text(second!, ".name")).toBe("Reconnecting…");
    expect(text(second!, ".sub")).toContain("42 s");
    expect(text(root, ".detail-head .meta")).toBe("Galaxy S23 · Chrome · connected 12 min ago");
    root.querySelector<HTMLButtonElement>(".detail-head .danger")!.click();
    expect(bridge.calls.at(-1)).toBe("kick 1");
    second!.click();
    expect(text(root, ".detail-head .meta")).toBe("iPhone 15 · Safari · reconnecting, 42 s left");
  });

  it("follows the phone's inputs in the live view", async () => {
    await start((b) => {
      b.snap.controllers = [controller(1, { status: "connected", device: "Pixel · Chrome", gyro: true })];
      b.liveState = { buttons: (1 << 0) | (1 << 13), sticks: [32767, 0, 0, -32767], triggers: [255, 0], gyro: true, touches: [[3, 65535, 0]], rate: [10, 20, 30], accel: [0, 9.8, 0] };
    });
    await app.frame(1000);
    const pad = root.querySelector(".pad")!;
    expect(pad.querySelector('[data-b="cross"]')!.classList.contains("on")).toBe(true);
    expect(pad.querySelector('[data-b="circle"]')!.classList.contains("on")).toBe(false);
    expect(pad.querySelector('[data-b="r3"]')!.classList.contains("on")).toBe(true); // the stick click lights its own circle
    expect(Number(pad.querySelector('[data-stick="left"]')!.getAttribute("cx"))).toBeCloseTo(61.29 + 15.5, 1);
    expect(Number(pad.querySelector('[data-stick="right"]')!.getAttribute("cy"))).toBeCloseTo(61.29 - 15.5, 1);
    expect(Number(pad.querySelector('[data-trig="0"]')!.getAttribute("height"))).toBeCloseTo(38, 1);
    const touch = pad.querySelector('[data-touch="0"]')!;
    expect(touch.getAttribute("visibility")).toBe("visible");
    expect(Number(touch.getAttribute("cx"))).toBeCloseTo(42.5 + 79.5, 1);
    expect(text(root, ".gyro-vals")).toBe("gyro 10.0 20.0 30.0 °/s");
    expect(pad.querySelector('[data-stick="left"]')!.getAttribute("visibility")).toBe("visible");
    bridge.liveState = { ...bridge.liveState!, sticks: [0, 0, 0, 0] };
    await app.frame(1050);
    expect(pad.querySelector('[data-stick="left"]')!.getAttribute("visibility")).toBe("hidden"); // no dot while the stick rests
    bridge.liveState = { ...bridge.liveState!, gyro: false, rate: null, accel: null };
    await app.frame(1100);
    expect(text(root, ".gyro-vals")).toBe("gyroscope off");
  });

  it("shows latency now, average and peak, the vibration and the lightbar", async () => {
    await start((b) => {
      b.snap.controllers = [controller(1, { status: "connected", device: "Pixel · Chrome", rttMs: 5, rumble: [0.5, 0], lightbar: [255, 0, 0] })];
    });
    for (const rtt of [5, 9, 7]) {
      bridge.snap.controllers[0]!.rttMs = rtt;
      await app.tick();
    }
    const values = [...root.querySelectorAll(".info dd")].map((d) => d.textContent);
    expect(values.slice(0, 3)).toEqual(["7 ms", "7 ms", "9 ms"]);
    expect(values[4]).toBe("Vibrating");
    expect(values[5]).toBe("#ff0000");
    expect(root.querySelector(".spark .line")!.getAttribute("d")).toMatch(/^M0,/);
  });

  it("refreshes when the app says something changed", async () => {
    await start();
    bridge.snap.controllers = [controller(3)];
    for (const l of bridge.listeners) l();
    await settle();
    expect(root.querySelectorAll(".item")).toHaveLength(1);
  });

  it("applies and saves settings at once", async () => {
    await start((b) => {
      b.snap.controllers = [controller(1)];
    });
    root.querySelector<HTMLButtonElement>('[data-popover="settings"]')!.click();
    const settings = () => root.querySelector<HTMLElement>(".popover.settings")!;
    settings().querySelector<HTMLButtonElement>('[data-value="dark"]')!.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(bridge.saved.at(-1)!.theme).toBe("dark");
    settings().querySelector<HTMLButtonElement>('[data-value="pt"]')!.click();
    await settle();
    expect(text(root, ".item .name")).toBe("Aguardando celular");
    expect(text(root, ".popover.settings h2")).toBe("Configurações");
    const hold = settings().querySelector<HTMLInputElement>('input[type="range"]')!;
    hold.value = "120";
    hold.dispatchEvent(new Event("input"));
    hold.dispatchEvent(new Event("change"));
    expect(bridge.saved.at(-1)!.holdSeconds).toBe(120);
    expect(text(settings(), ".field span")).toBe("Segurar o controle por 120 s");
    const startup = settings().querySelector<HTMLInputElement>('[data-setting="startWithSystem"]')!;
    startup.click();
    expect(bridge.saved.at(-1)!.startWithSystem).toBe(true);
    const phones = settings().querySelector<HTMLInputElement>('[data-setting="phonesCanCreate"]')!;
    phones.click();
    expect(bridge.saved.at(-1)!.phonesCanCreate).toBe(false);
    const tray = settings().querySelector<HTMLInputElement>('[data-setting="closeToTray"]')!;
    tray.click();
    expect(bridge.saved.at(-1)!.closeToTray).toBe(false);
  });

  it("explains a missing driver from the title bar", async () => {
    await start((b) => {
      b.snap.driver = { ok: false, backend: null, reason: "The ViGEmBus driver is not available", fix: "Install ViGEmBus from https://github.com/nefarius/ViGEmBus/releases" };
    });
    const chip = root.querySelector<HTMLButtonElement>('[data-popover="driver"]')!;
    expect(chip.classList.contains("warn")).toBe(true);
    expect(chip.textContent).toContain("No virtual controllers");
    chip.click();
    const pop = root.querySelector<HTMLElement>(".popover.driver")!;
    expect(pop.textContent).toContain("The ViGEmBus driver is not available");
    expect(text(pop, "code")).toContain("nefarius/ViGEmBus");
  });

  it("lists the official skin and marks importing as coming soon", async () => {
    await start();
    root.querySelector<HTMLButtonElement>('[data-tab="skins"]')!.click();
    expect(text(root, ".skins-head h1")).toBe("Skins");
    const official = root.querySelector(".skin")!;
    expect(text(official as HTMLElement, "strong")).toBe("Ninjoy");
    expect(text(official as HTMLElement, "small")).toMatch(/^Official · Ninjoy · v\d/);
    expect(root.querySelector<HTMLButtonElement>(".skin.add")!.disabled).toBe(true);
  });

  it("moves the window from the title bar and hides to the tray on close, explaining it once", async () => {
    localStorage.removeItem("ninjoy-tray-notice");
    await start();
    expect(root.querySelector(".titlebar")!.hasAttribute("data-tauri-drag-region")).toBe(true);
    root.querySelector<HTMLButtonElement>(".win .close")!.click();
    expect(bridge.calls).not.toContain("close");
    expect(text(root, ".popover.tray h2")).toBe("Ninjoy keeps running");
    root.querySelector<HTMLButtonElement>(".popover.tray button")!.click();
    expect(bridge.calls).toEqual(["close"]);
    root.querySelector<HTMLButtonElement>(".win .close")!.click();
    expect(bridge.calls).toEqual(["close", "close"]);
    expect(root.querySelector(".popover.tray")).toBeNull();
  });

  it("quits on close without the tray notice when closing to the tray is off", async () => {
    localStorage.removeItem("ninjoy-tray-notice");
    await start((b) => {
      b.snap.settings.closeToTray = false;
    });
    root.querySelector<HTMLButtonElement>(".win .close")!.click();
    expect(bridge.calls).toEqual(["close"]);
    expect(root.querySelector(".popover.tray")).toBeNull();
  });
});

describe("latency stats", () => {
  it("averages, peaks and draws the last samples", () => {
    const s = latencyStats([4, 8, 6])!;
    expect([s.now, s.average, s.peak]).toEqual([6, 6, 8]);
    expect(s.line.startsWith("M0,")).toBe(true);
    expect(latencyStats([])).toBeNull();
  });
});
