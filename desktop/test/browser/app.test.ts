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
    skin: null,
    ...patch,
  };
}

/** A fake app behind the window. */
class FakeBridge implements Bridge {
  snap: Snapshot = {
    addresses: { name: "ninjoy.local", ips: ["192.168.0.10"], securePort: 8443, plainPort: 8080 },
    driver: { ok: true, backend: "ViGEmBus", reason: null, fix: null },
    settings: { theme: "auto", language: "en", holdSeconds: 60, phonesCanCreate: true, startWithSystem: false, closeToTray: true, defaultSkin: "ninjoy" },
    controllers: [],
    skins: [{ id: "ninjoy", name: "Ninjoy", author: "Ninjoy", version: "0.2.0", format: 1, bundled: true, preview: null, files: [], broken: null, isDefault: true }],
  };
  files: Record<string, string> = {};
  brokenReports: Record<string, string>[] = [];
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
  async skinFile(id: string, path: string) {
    const text = this.files[`${id}/${path}`];
    if (text === undefined) throw new Error("missing");
    return new TextEncoder().encode(text);
  }
  async setBrokenSkins(broken: Record<string, string>) {
    this.brokenReports.push(broken);
    for (const s of this.snap.skins) s.broken = broken[s.id] ?? null;
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

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="bg" width="100" height="100"/></svg>';
const ARCADE = {
  format: 2, name: "Arcade", author: "Carlos", version: "1.0.0", orientation: "landscape",
  controls: [
    { id: "menu", type: "system", action: "menu", svg: "c/m.svg", box: { x: 750, y: 600, width: 100, height: 100 }, elements: { bg: { role: "base" } } },
    { id: "lp", type: "button", bindings: ["square"], svg: "c/m.svg", box: { x: 1000, y: 200, width: 100, height: 100 }, elements: { bg: { role: "base" } } },
  ],
};
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
      b.liveState = { buttons: (1 << 0) | (1 << 13) | (1 << 17), sticks: [32767, 0, 0, -32767], triggers: [255, 0], gyro: true, touches: [[3, 65535, 0]], rate: [10, 20, 30], accel: [0, 9.8, 0] };
    });
    await app.frame(1000);
    const pad = root.querySelector(".pad")!;
    expect(pad.querySelector('[data-b="cross"]')!.classList.contains("on")).toBe(true);
    expect(pad.querySelector('[data-b="circle"]')!.classList.contains("on")).toBe(false);
    expect(pad.querySelector('[data-b="r3"]')!.classList.contains("on")).toBe(true); // the stick click lights its own circle
    expect(pad.querySelector('[data-b="touchpad"]')!.classList.contains("on")).toBe(true); // the touchpad click lights the touchpad
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

  it("shows cards instead of the QR code while a phone plays: latency, skin and address", async () => {
    await start((b) => {
      b.snap.controllers = [
        controller(1, { status: "connected", device: "Pixel 8 · Chrome", rttMs: 5, connectedSince: NOW - 75 * 60000, lightbar: [255, 0, 0], url: "http://192.168.0.10/1", nameUrl: "http://ninjoy.local/1" }),
      ];
    });
    for (const rtt of [5, 9, 7]) {
      bridge.snap.controllers[0]!.rttMs = rtt;
      await app.tick();
    }
    expect(root.querySelector(".qr")).toBeNull(); // someone plays: no QR code to scan
    expect(text(root, ".card.latency .big")).toBe("7 ms");
    expect(text(root, ".card.latency small")).toBe("average 7 ms · peak 9 ms");
    expect(root.querySelector(".spark .line")!.getAttribute("d")).toMatch(/^M0,/);
    expect(text(root, ".card-addr")).toBe("192.168.0.10/1ninjoy.local/1");
    expect(root.querySelector(".card.vibration")).toBeNull();
    // kicked: waiting again, the QR code comes back
    bridge.snap.controllers = [controller(1)];
    await app.refresh();
    expect(root.querySelector(".waiting-view .qr")).not.toBeNull();
  });

  it("shows each press in the input history, newest on the right, with the frames it was held", async () => {
    await start((b) => {
      b.snap.controllers = [controller(1, { status: "connected", device: "Pixel · Chrome" })];
    });
    const live = (buttons: number, sticks: [number, number, number, number] = [0, 0, 0, 0]) => ({ buttons, sticks, triggers: [0, 0] as [number, number], gyro: false, touches: [], rate: null, accel: null });
    const shown = () =>
      [...root.querySelectorAll<HTMLElement>(".history .in")].map((i) => `${i.className.replace(/in in-| entering/g, "").replace(" held", "*")} ${i.querySelector("small")!.textContent}`);
    const steps: [number, ReturnType<typeof live>][] = [
      [0, live(1 << 5)], // d-pad down
      [100, live((1 << 5) | (1 << 7))], // + right: only the new press enters
      [150, live((1 << 7) | (1 << 2))], // down released, square pressed
      [250, live(0, [0, -32767, 0, 0])], // left stick up
      [300, live(0)],
    ];
    for (const [t, s] of steps) {
      bridge.liveState = s;
      await app.frame(NOW + t);
    }
    expect(shown()).toEqual(["down 9", "right 9", "square 6", "ls-up 3"]);
    bridge.liveState = live(1 << 0);
    await app.frame(NOW + 400);
    await app.frame(NOW + 500);
    expect(shown().at(-1)).toBe("cross* 6"); // held: lit and still counting
    const sizes = () => [...root.querySelectorAll<HTMLElement>(".history .in")].map((i) => Number(i.style.getPropertyValue("--s")));
    expect(sizes()).toEqual([...sizes()].sort((a, b) => a - b)); // older ones smaller
    // idle for a long time: the history stays
    bridge.liveState = live(0);
    await app.frame(NOW + 60000);
    expect(shown()).toHaveLength(5);
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

  it("lists the skin library, chooses the default and shows broken skins", async () => {
    await start((b) => {
      b.snap.skins.push(
        { id: "arcade", name: "Arcade", author: "Carlos", version: "1.0.0", format: 2, bundled: false, preview: null, files: ["skin.json"], broken: null, isDefault: false },
        { id: "old", name: "Old", author: "X", version: "1.0.0", format: 9, bundled: false, preview: null, files: [], broken: "format 9 is not supported by this version", isDefault: false },
      );
      b.files["arcade/skin.json"] = JSON.stringify(ARCADE);
    });
    root.querySelector<HTMLButtonElement>('[data-tab="skins"]')!.click();
    const card = (id: string) => root.querySelector<HTMLButtonElement>(`.skin[data-skin="${id}"]`)!;
    expect(text(card("ninjoy"), "small")).toMatch(/^Official · Ninjoy · v\d/);
    expect(card("ninjoy").getAttribute("aria-pressed")).toBe("true");
    expect(text(card("arcade"), "small")).toBe("Carlos · v1.0.0");
    expect(card("old").disabled).toBe(true);
    expect(text(card("old"), "small")).toContain("format 9");
    expect(root.querySelector(".skin.soon:not(.add)")).toBeNull(); // no "coming soon" placeholder skin
    card("arcade").click();
    await settle();
    expect(bridge.saved.at(-1)!.defaultSkin).toBe("arcade");
  });

  it("checks installed skins with the skin format rules and reports the broken ones", async () => {
    await start((b) => {
      b.snap.skins.push(
        { id: "good", name: "Good", author: "C", version: "1.0.0", format: 2, bundled: false, preview: null, files: ["skin.json", "c/m.svg"], broken: null, isDefault: false },
        { id: "bad", name: "Bad", author: "C", version: "1.0.0", format: 2, bundled: false, preview: null, files: ["skin.json"], broken: null, isDefault: false },
      );
      b.files["good/skin.json"] = JSON.stringify(ARCADE);
      b.files["good/c/m.svg"] = SQUARE;
      b.files["bad/skin.json"] = JSON.stringify({ ...ARCADE, controls: ARCADE.controls.slice(1) }); // its svg is missing
    });
    await settle();
    await settle();
    expect(Object.keys(bridge.brokenReports.at(-1)!)).toEqual(["bad"]);
  });

  it("shows which skin each phone uses", async () => {
    await start((b) => {
      b.snap.controllers = [controller(1, { status: "connected", device: "Pixel · Chrome", skin: "ninjoy" })];
    });
    expect(text(root, ".card.skin .state")).toBe("Ninjoy");
    expect(text(root, ".card.skin small")).toMatch(/^Official · Ninjoy · v/);
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
