/** The Ninjoy window: title bar, controller list and details, skins page, settings. */

import logoNinja from "../../assets/brand/logo-ninja.svg?raw";
import logoWord from "../../assets/brand/logo-word.svg?raw";
import preview from "../../skins/ninjoy/preview.png";
import type { Bridge, ControllerView, Language, Settings, Snapshot, Theme } from "./bridge.ts";
import { renderDetails, renderEmpty } from "./details.ts";
import { el, html, icons, lightbarCss, shortUrl } from "./dom.ts";
import { createI18n, detectLanguage, type I18n } from "./i18n/index.ts";
import { renderSkins } from "./skins.ts";

/** Latency samples kept per controller (one per second). */
const HISTORY = 60;
/** The splash (like the phone's), at most this long. */
export const SPLASH_MS = 1400;

export interface AppOptions {
  systemLanguages?: readonly string[];
  /** refresh every second and run the live view every frame (off in tests: call tick/frame) */
  timers?: boolean;
  splash?: boolean;
  now?: () => number;
}

export async function createApp(root: HTMLElement, bridge: Bridge, o: AppOptions = {}) {
  const now = o.now ?? (() => Date.now());
  let snapshot: Snapshot = await bridge.snapshot();
  let i18n: I18n = createI18n(detectLanguage(snapshot.settings.language, o.systemLanguages ?? navigator.languages));
  let selected: number | null = snapshot.controllers[0]?.number ?? null;
  let page: "controllers" | "skins" = "controllers";
  const latency = new Map<number, number[]>();
  const qrCache = new Map<string, Promise<string>>();
  const qr = (url: string) => {
    if (!qrCache.has(url)) qrCache.set(url, bridge.qrSvg(url));
    return qrCache.get(url)!;
  };
  const ctx = { bridge, i18n: () => i18n, qr, preview, ninja: logoNinja };

  const app = el("div", { className: "app" });
  const watermark = el("div", { className: "watermark", innerHTML: logoNinja, ariaHidden: "true" });
  root.replaceChildren(watermark, app);
  if (o.splash) {
    const splash = el("div", { className: "splash", innerHTML: logoWord, ariaHidden: "true" });
    root.append(splash);
    setTimeout(() => splash.remove(), SPLASH_MS);
  }

  const items = el("div", { className: "items", role: "listbox" });
  const count = el("span");
  // the details sit on the window background, like the prototype (only the list is a card)
  const detail = el("main", { className: "detail" });
  let details: ReturnType<typeof renderDetails> | null = null;
  let popover: HTMLElement | null = null;

  const closePopover = () => {
    popover?.remove();
    popover = null;
  };
  document.addEventListener("pointerdown", (e) => {
    if (popover && !popover.contains(e.target as Node) && !(e.target as Element).closest?.("[data-popover]")) closePopover();
  });

  const applyTheme = (theme: Theme) => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  };

  const setSettings = async (patch: Partial<Settings>) => {
    const settings = { ...snapshot.settings, ...patch };
    snapshot = { ...snapshot, settings };
    applyTheme(settings.theme);
    if (patch.language) {
      i18n = createI18n(detectLanguage(settings.language, o.systemLanguages ?? navigator.languages));
      render();
      openSettings();
    }
    await bridge.setSettings(settings);
  };

  /** One choice among a few (pressed buttons). */
  const seg = <T extends string>(label: string, options: [T, string][], value: T, pick: (v: T) => void) => {
    const group = el("div", { className: "seg", role: "group", ariaLabel: label });
    for (const [v, text] of options) {
      const b = el("button", { type: "button", textContent: text, ariaPressed: String(v === value) });
      b.dataset.value = v;
      b.addEventListener("click", () => {
        for (const other of group.children) other.setAttribute("aria-pressed", String(other === b));
        pick(v);
      });
      group.append(b);
    }
    return group;
  };

  const openSettings = () => {
    closePopover();
    const { t } = i18n;
    const s = snapshot.settings;
    const hold = el("input", { type: "range", min: "10", max: "300", step: "10", value: String(s.holdSeconds), ariaLabel: t("settings.hold") });
    const holdText = el("span", { textContent: t("settings.holdValue", { n: s.holdSeconds }) });
    hold.addEventListener("input", () => (holdText.textContent = t("settings.holdValue", { n: hold.value })));
    hold.addEventListener("change", () => void setSettings({ holdSeconds: Number(hold.value) }));
    const toggle = (label: string, on: boolean, key: "phonesCanCreate" | "startWithSystem") => {
      const input = el("input", { type: "checkbox", className: "switch", checked: on, role: "switch", ariaLabel: label });
      input.dataset.setting = key;
      input.addEventListener("change", () => void setSettings({ [key]: input.checked }));
      return el("label", { className: "field" }, [label, input]);
    };
    const address = snapshot.addresses.name ?? snapshot.addresses.ips[0] ?? t("title.noNetwork");
    popover = el("section", { className: "popover settings", role: "dialog", ariaLabel: t("settings.title") }, [
      el("h2", { textContent: t("settings.title") }),
      el("div", { className: "row" }, [
        el("span", { className: "label", textContent: t("settings.theme") }),
        seg<Theme>(t("settings.theme"), [["auto", t("theme.auto")], ["dark", t("theme.dark")], ["light", t("theme.light")]], s.theme, (theme) => void setSettings({ theme })),
      ]),
      el("div", { className: "row" }, [
        el("span", { className: "label", textContent: t("settings.language") }),
        seg<Language>(t("settings.language"), [["auto", t("language.auto")], ["en", "English"], ["pt", "Português"]], s.language, (language) => void setSettings({ language })),
      ]),
      el("div", { className: "row" }, [el("span", { className: "label", textContent: t("settings.hold") }), el("div", { className: "field" }, [holdText]), el("div", { className: "field" }, [hold])]),
      toggle(t("settings.phones"), s.phonesCanCreate, "phonesCanCreate"),
      toggle(t("settings.startup"), s.startWithSystem, "startWithSystem"),
      el("div", { className: "row" }, [el("span", { className: "label", textContent: t("settings.network") }), el("div", { className: "field" }, [t("settings.address"), el("span", { textContent: address })])]),
    ]);
    root.append(popover);
  };

  const openDriver = () => {
    closePopover();
    const { t } = i18n;
    const d = snapshot.driver;
    popover = el("section", { className: "popover driver", role: "dialog", ariaLabel: t("driver.title") }, [
      el("h2", { textContent: t("driver.title") }),
      ...(d.ok ? [el("p", { textContent: t("driver.okText", { backend: d.backend ?? "" }) })] : [el("p", { textContent: d.reason ?? "" }), el("code", { textContent: d.fix ?? "" }), el("p", { textContent: t("driver.phones") })]),
    ]);
    root.append(popover);
  };

  /** The first close explains that Ninjoy stays in the tray (once per computer). */
  const close = () => {
    let told = true;
    try {
      told = localStorage.getItem("ninjoy-tray-notice") === "1";
    } catch {
      // no storage: do not insist
    }
    if (told) return bridge.close();
    closePopover();
    const { t } = i18n;
    const ok = el("button", { type: "button", className: "pill create", textContent: t("tray.ok") });
    ok.addEventListener("click", () => {
      try {
        localStorage.setItem("ninjoy-tray-notice", "1");
      } catch {
        // fine
      }
      closePopover();
      bridge.close();
    });
    popover = el("section", { className: "popover tray", role: "dialog", ariaLabel: t("tray.title") }, [el("h2", { textContent: t("tray.title") }), el("p", { textContent: t("tray.notice") }), ok]);
    root.append(popover);
  };

  const quality = (rtt: number | null) => (rtt === null ? 0 : rtt < 15 ? 3 : rtt < 40 ? 2 : 1);

  const renderList = () => {
    const { t } = i18n;
    count.textContent = String(snapshot.controllers.length);
    items.replaceChildren(
      ...snapshot.controllers.map((c) => {
        const name = c.status === "reconnecting" ? t("item.reconnecting") : c.status === "waiting" ? t("item.waiting") : (c.device ?? "");
        const sub = el("span", { className: "sub" });
        let end: HTMLElement;
        if (c.status === "reconnecting") {
          sub.append(`${c.device ?? ""} · `, el("b", { textContent: t("item.seconds", { n: c.holdLeft ?? 0 }) }));
          end = el("span", { className: "ring" });
          end.style.setProperty("--p", String(((c.holdLeft ?? 0) / snapshot.settings.holdSeconds) * 100));
        } else if (c.status === "waiting") {
          sub.append(shortUrl(c.nameUrl ?? c.url));
          end = el("span", { className: "pulse" });
        } else {
          const bars = el("span", { className: "bars" }, [el("i"), el("i"), el("i")]);
          bars.dataset.q = String(quality(c.rttMs));
          sub.append(c.pad === "plugged" ? "DS4 · " : "", bars, c.rttMs === null ? "" : ` ${t("value.ms", { n: Math.round(c.rttMs) })}`);
          end = el("span", { className: "activity" });
        }
        const item = el("button", { type: "button", className: `item ${c.status}`, role: "option", ariaSelected: String(c.number === selected) }, [
          el("span", { className: "num", textContent: String(c.number) }),
          el("span", {}, [el("span", { className: "name", textContent: name }), sub]),
          end,
        ]);
        item.dataset.n = String(c.number);
        item.style.setProperty("--lightbar", lightbarCss(c.lightbar, c.number));
        item.addEventListener("click", () => select(c.number));
        return item;
      }),
    );
  };

  const renderDetail = () => {
    const c = snapshot.controllers.find((x) => x.number === selected);
    if (!c) {
      details = null;
      detail.replaceChildren(renderEmpty(ctx));
      return;
    }
    if (!details || details.number !== c.number || details.status !== c.status) {
      details = renderDetails(ctx, c);
      detail.replaceChildren(details.el);
    }
    details.update(c, latency.get(c.number) ?? [], now());
  };

  const select = (n: number) => {
    selected = n;
    renderList();
    renderDetail();
  };

  const tab = (key: "controllers" | "skins", text: string) => {
    const b = el("button", { type: "button", textContent: text, ariaPressed: String(page === key) });
    b.dataset.tab = key;
    b.addEventListener("click", () => {
      page = key;
      render();
    });
    return b;
  };

  const render = () => {
    const { t } = i18n;
    document.documentElement.lang = i18n.locale;
    const a = snapshot.addresses;
    const network = el("span", { className: "chip" }, [html(icons.wifi), ...(a.name ? [el("code", { textContent: a.name }), el("span", { textContent: "·", style: "color:var(--text-faint)" })] : []), el("code", { textContent: a.ips[0] ?? t("title.noNetwork") })]);
    const driver = el("button", { type: "button", className: `chip${snapshot.driver.ok ? "" : " warn"}` }, [el("span", { className: "dot" }), t(snapshot.driver.ok ? "driver.ok" : "driver.missing")]);
    driver.dataset.popover = "driver";
    driver.addEventListener("click", () => (popover?.classList.contains("driver") ? closePopover() : openDriver()));
    const settingsButton = el("button", { type: "button", className: "icon-btn", title: t("window.settings"), ariaLabel: t("window.settings") }, [html(icons.gear)]);
    settingsButton.dataset.popover = "settings";
    settingsButton.addEventListener("click", () => (popover?.classList.contains("settings") ? closePopover() : openSettings()));
    const winButton = (cls: string, title: string, svg: string, act: () => void) => {
      const b = el("button", { type: "button", className: cls, title, ariaLabel: title, innerHTML: svg });
      b.addEventListener("click", act);
      return b;
    };
    const titlebar = el("header", { className: "titlebar" }, [
      el("div", { className: "brand", innerHTML: logoWord }),
      el("nav", { className: "seg tabs", ariaLabel: "Ninjoy" }, [tab("controllers", t("tab.controllers")), tab("skins", t("tab.skins"))]),
      el("div", { className: "drag" }),
      network,
      driver,
      settingsButton,
      el("div", { className: "win" }, [
        winButton("", t("window.minimize"), icons.minimize, () => bridge.minimize()),
        winButton("", t("window.maximize"), icons.maximize, () => bridge.toggleMaximize()),
        winButton("close", t("window.close"), icons.close, close),
      ]),
    ]);
    // the window moves by its title bar (Tauri)
    for (const e of [titlebar, titlebar.querySelector(".brand")!, titlebar.querySelector(".drag")!]) e.setAttribute("data-tauri-drag-region", "");

    const create = el("button", { type: "button", className: "pill create" }, [html(icons.plus), t("create")]);
    create.addEventListener("click", async () => {
      const n = await bridge.create();
      await refresh();
      select(n);
    });
    const list = el("aside", { className: "panel list" }, [el("header", {}, [el("h2", { textContent: t("list.title") }), count]), items, create]);
    const main = el("div", { className: "main" }, [list, detail]);

    details = null; // texts change with the language
    app.replaceChildren(titlebar, page === "controllers" ? main : renderSkins(i18n, preview));
    renderList();
    renderDetail();
  };

  /** Asks for a fresh snapshot; `sample` also records each controller's latency (once a second). */
  const refresh = async (sample = false) => {
    snapshot = await bridge.snapshot();
    if (sample) {
      for (const c of snapshot.controllers) {
        if (c.rttMs === null || c.status !== "connected") continue;
        const history = latency.get(c.number) ?? [];
        history.push(c.rttMs);
        if (history.length > HISTORY) history.shift();
        latency.set(c.number, history);
      }
    }
    if (selected !== null && !snapshot.controllers.some((c) => c.number === selected)) selected = snapshot.controllers[0]?.number ?? null;
    if (selected === null) selected = snapshot.controllers[0]?.number ?? null;
    renderList();
    renderDetail();
  };

  let pendingLive = false;
  /** One live view update for the selected controller. */
  const frame = async (time: number) => {
    const c = snapshot.controllers.find((x) => x.number === selected);
    if (!details || !c || c.status !== "connected" || pendingLive) return;
    pendingLive = true;
    try {
      details.live(await bridge.live(c.number), time);
    } finally {
      pendingLive = false;
    }
  };

  applyTheme(snapshot.settings.theme);
  render();
  const stop = bridge.onChanged(() => void refresh());
  let timer = 0;
  let raf = 0;
  if (o.timers ?? true) {
    timer = window.setInterval(() => void refresh(true), 1000);
    const loop = (time: number) => {
      void frame(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return {
    refresh,
    /** one second: refresh with latency samples */
    tick: () => refresh(true),
    frame,
    get selected() {
      return selected;
    },
    dispose() {
      stop();
      clearInterval(timer);
      cancelAnimationFrame(raf);
      closePopover();
      root.replaceChildren();
    },
  };
}

export type App = Awaited<ReturnType<typeof createApp>>;
export type { ControllerView };
