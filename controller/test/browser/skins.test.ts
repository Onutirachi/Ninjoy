import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { createI18n } from "../../src/i18n/index.ts";
import { createSession } from "../../src/platform/session.ts";
import { createStore } from "../../src/platform/storage.ts";
import { chosenSkin, fetchSkinIndex, loadOfficialSkin, loadSkinFromHost, pickSkin, saveChosenSkin, type SkinIndex } from "../../src/skins.ts";
import { createMenu } from "../../src/ui/menu.ts";
import "../../src/ui/styles.css";
import { mount, stubPlatform } from "./helpers.ts";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="bg" width="100" height="100"/></svg>';
const ARCADE = {
  format: 2, name: "Arcade", author: "Carlos", version: "1.0.0", orientation: "landscape",
  controls: [
    { id: "menu", type: "system", action: "menu", svg: "c/m.svg", box: { x: 750, y: 600, width: 100, height: 100 }, elements: { bg: { role: "base" } } },
    { id: "lp", type: "button", bindings: ["square"], svg: "c/m.svg", box: { x: 1000, y: 200, width: 100, height: 100 }, elements: { bg: { role: "base" } } },
  ],
};

/** A host with the official skin and "arcade" (fetch stub). */
function host(index: SkinIndex, files: Record<string, string>) {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    if (url === "/skins/index.json") return new Response(JSON.stringify(index));
    const body = files[url];
    return body === undefined ? new Response("", { status: 404 }) : new Response(body);
  };
  return { fetcher: fetcher as typeof fetch, asked };
}
const INDEX: SkinIndex = {
  default: "ninjoy",
  skins: [
    { id: "ninjoy", name: "Ninjoy", author: "Ninjoy", version: "0.2.0", format: 1, files: [] },
    { id: "arcade", name: "Arcade", author: "Carlos", version: "1.0.0", format: 2, files: ["skin.json", "c/m.svg"] },
  ],
};

describe("skins from the host", () => {
  it("loads a skin's files from the host", async () => {
    const { fetcher, asked } = host(INDEX, { "/skins/arcade/skin.json": JSON.stringify(ARCADE), "/skins/arcade/c/m.svg": SVG });
    const index = await fetchSkinIndex(fetcher);
    const skin = await loadSkinFromHost(index.skins[1]!, fetcher);
    expect(skin.meta.name).toBe("Arcade");
    expect(asked).toContain("/skins/arcade/c/m.svg");
  });

  it("picks the phone's skin, or the host's default when it is gone", () => {
    expect(pickSkin(INDEX, "arcade")).toEqual({ id: "arcade", missing: false });
    expect(pickSkin(INDEX, null)).toEqual({ id: "ninjoy", missing: false });
    expect(pickSkin(INDEX, "gone")).toEqual({ id: "ninjoy", missing: true });
    expect(pickSkin({ ...INDEX, default: "arcade" }, null)).toEqual({ id: "arcade", missing: false });
  });

  it("keeps the choice on the phone", () => {
    const storage = memoryStorage();
    expect(chosenSkin(storage)).toBeNull();
    saveChosenSkin("arcade", storage);
    expect(chosenSkin(storage)).toBe("arcade");
    saveChosenSkin(null, storage);
    expect(chosenSkin(storage)).toBeNull();
  });
});

describe("layout per skin", () => {
  it("keeps edits per skin id and moves the official skin's old edits over once", () => {
    const storage = memoryStorage({ "ninjoy.v1.layout.Ninjoy@0.1.0": JSON.stringify({ face: { dx: 5, dy: 0, scale: 1 } }) });
    const store = createStore(storage);
    expect(store.loadLayout("ninjoy")).toEqual({ face: { dx: 5, dy: 0, scale: 1 } });
    store.saveLayout("arcade", { lever: { dx: 1, dy: 2, scale: 1 } });
    expect(store.loadLayout("arcade")).toEqual({ lever: { dx: 1, dy: 2, scale: 1 } });
    expect(store.loadLayout("ninjoy")).toEqual({ face: { dx: 5, dy: 0, scale: 1 } });
  });
});

describe("the session tells the host the skin", () => {
  it("reports the skin after joining and when it changes, and hears when skins change", () => {
    const sockets: { sent: Uint8Array[]; readyState: number; onopen?: () => void; onmessage?: (e: { data: ArrayBuffer }) => void; send(b: Uint8Array): void; close(): void }[] = [];
    let changed = 0;
    const session = createSession({
      url: "ws://host/ws",
      device: new Uint8Array(16),
      onStatus: () => {},
      onSkinsChanged: () => changed++,
      createSocket: () => {
        const s = { sent: [] as Uint8Array[], readyState: 0, send(b: Uint8Array) { this.sent.push(new Uint8Array(b)); }, close() {} };
        sockets.push(s);
        return s as unknown as WebSocket;
      },
      doc: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} } as never,
    });
    session.setSkin("arcade");
    session.join(1);
    const s = sockets[0]!;
    s.readyState = 1;
    s.onopen?.();
    s.onmessage?.({ data: Uint8Array.of(0x81, 1, 1, 0).buffer });
    const skins = () => s.sent.filter((m) => m[0] === 0x06).map((m) => new TextDecoder().decode(m.subarray(2)));
    expect(skins()).toEqual(["arcade"]);
    session.setSkin("");
    expect(skins()).toEqual(["arcade", ""]);
    s.onmessage?.({ data: Uint8Array.of(0x89).buffer });
    expect(changed).toBe(1);
    session.close();
  });
});

describe("the menu's skin section", () => {
  let controller: Controller;
  afterEach(() => controller.dispose());

  it("lists the host's skins, marks the default and the one in use, and picks one", async () => {
    const skin = await loadOfficialSkin();
    const root = mount(1600, 720);
    controller = createController({ skin, root, storage: null, platform: stubPlatform() });
    const picked: (string | null)[] = [];
    const menu = createMenu({
      controller, skin, i18n: () => createI18n("en"), parent: root, onLanguage: () => {}, onEditLayout: () => {},
      skins: () => ({ index: INDEX, current: "ninjoy", chosen: null, previewUrl: (id: string, path: string) => `/skins/${id}/${path}` }),
      onSkin: (id) => picked.push(id),
    });
    menu.show();
    [...root.querySelectorAll<HTMLButtonElement>(".nj-tab")].find((t) => t.textContent === "Skins")!.click();
    const options = [...root.querySelectorAll<HTMLElement>(".nj-skin")];
    expect(options.map((o) => o.querySelector("strong")!.firstChild!.textContent)).toEqual(["Host default (Ninjoy)", "Ninjoy", "Arcade"]);
    expect(options[0]!.querySelector<HTMLInputElement>("input")!.checked).toBe(true);
    const arcade = options[2]!.querySelector<HTMLInputElement>("input")!;
    arcade.checked = true;
    arcade.dispatchEvent(new Event("change"));
    expect(picked).toEqual(["arcade"]);
    menu.dispose();
  });
});
