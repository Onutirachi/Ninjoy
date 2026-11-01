/** The Ninjoy window: title bar, controller list and details, skins page, settings. */

import logoNinja from "../../assets/brand/logo-ninja.svg?raw";
import logoFull from "../../assets/brand/logo-full.svg?raw";
import logoWord from "../../assets/brand/logo-word.svg?raw";
import preview from "../../skins/ninjoy/preview.png";
import type { Bridge, ControllerView, Language, SetupItem, SetupView, Settings, Snapshot, Theme } from "./bridge.ts";
import { renderDetails, renderEmpty } from "./details.ts";
import { el, html, icons, lightbarCss, shortUrl } from "./dom.ts";
import { createI18n, detectLanguage, type I18n, type MessageKey } from "./i18n/index.ts";
import { controllersMissing, isIgnored, orderedItems, pendingItems, renderStartScreen, wantsStartScreen } from "./setup.ts";
import { checkLibrary, renderSkins } from "./skins.ts";

/** Latency samples kept per controller (one per second). */
const HISTORY = 60;
/** The splash (like the phone's), at most this long. */
export const SPLASH_MS = 1400;
/** "All set!" stays this long before the main window. */
export const ALL_SET_MS = 1500;

export interface AppOptions {
  systemLanguages?: readonly string[];
  /** refresh every second and run the live view every frame (off in tests: call tick/frame) */
  timers?: boolean;
  splash?: boolean;
  now?: () => number;
  /** how long "All set!" stays (tests: 0) */
  allSetMs?: number;
}

export async function createApp(root: HTMLElement, bridge: Bridge, o: AppOptions = {}) {
  const now = o.now ?? (() => Date.now());
  let snapshot: Snapshot = await bridge.snapshot();
  let i18n: I18n = createI18n(detectLanguage(snapshot.settings.language, o.systemLanguages ?? navigator.languages));
  let selected: number | null = snapshot.controllers[0]?.number ?? null;
  let page: "controllers" | "skins" = "controllers";
  /** Linux: the start screen while the system still needs setting up */
  let screen: "start" | "main" = wantsStartScreen(snapshot.setup, snapshot.settings) ? "start" : "main";
  let setupBusy = false;
  let allSet = false;
  const openItems = new Set<SetupItem["id"]>();
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
    const splash = el("div", { className: "splash", innerHTML: logoFull, ariaHidden: "true" });
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

  /** Linux: the controllers' touchpad as a desktop mouse; changing it asks for the password. */
  const touchpadToggle = () => {
    const { t } = i18n;
    const input = el("input", { type: "checkbox", className: "switch", checked: snapshot.settings.setup.touchpadMouse, role: "switch", ariaLabel: t("settings.touchpadMouse") });
    input.dataset.setting = "touchpadMouse";
    input.addEventListener("change", async () => {
      input.disabled = true;
      const result = await bridge.setupTouchpadMouse(input.checked);
      await refresh();
      if (result.setup) snapshot = { ...snapshot, setup: result.setup };
      // a cancelled prompt leaves the setting as it was
      input.checked = snapshot.settings.setup.touchpadMouse;
      input.disabled = false;
    });
    return el("label", { className: "field" }, [t("settings.touchpadMouse"), input]);
  };

  const openSettings = () => {
    closePopover();
    const { t } = i18n;
    const s = snapshot.settings;
    const hold = el("input", { type: "range", min: "10", max: "300", step: "10", value: String(s.holdSeconds), ariaLabel: t("settings.hold") });
    const holdText = el("span", { textContent: t("settings.holdValue", { n: s.holdSeconds }) });
    hold.addEventListener("input", () => (holdText.textContent = t("settings.holdValue", { n: hold.value })));
    hold.addEventListener("change", () => void setSettings({ holdSeconds: Number(hold.value) }));
    const toggle = (label: string, on: boolean, key: "phonesCanCreate" | "startWithSystem" | "closeToTray") => {
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
      toggle(t("settings.closeToTray"), s.closeToTray, "closeToTray"),
      ...(snapshot.setup ? [touchpadToggle()] : []),
      el("div", { className: "row" }, [el("span", { className: "label", textContent: t("settings.network") }), el("div", { className: "field" }, [t("settings.address"), el("span", { textContent: address })])]),
    ]);
    root.append(popover);
  };

  /** A short message at the bottom of the window (dismissed by a click, or after a while). */
  const showNotice = (message: string) => {
    root.querySelector(".notice")?.remove();
    const notice = el("div", { className: "notice", role: "status", textContent: message });
    notice.addEventListener("click", () => notice.remove());
    root.append(notice);
    setTimeout(() => notice.remove(), 12000);
  };

  /** Copies text for a terminal; false when the clipboard refused (the text stays selectable). */
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  /** The status panel's summary of the Linux setup: a light per item and the way to the start screen. */
  const setupSummary = (setup: SetupView) => {
    const { t } = i18n;
    const rows = orderedItems(setup).map((item) => {
      const row = el("li", {}, [
        el("span", { className: "state", title: t(`setup.state.${item.state}` as MessageKey), ariaLabel: t(`setup.state.${item.state}` as MessageKey) }),
        el("b", { textContent: t(`setup.${item.id}.title` as MessageKey) }),
      ]);
      row.dataset.item = item.id;
      row.dataset.state = item.state;
      if (isIgnored(item, snapshot.settings)) row.dataset.ignored = "";
      return row;
    });
    const parts: HTMLElement[] = [el("ul", { className: "setup-items" }, rows)];
    if (setup.ready) parts.unshift(el("p", { className: "ready", textContent: t("setup.readyText") }));
    if (!setup.items.some((i) => i.id === "firewall")) parts.push(el("p", { className: "firewall-help", textContent: t("setup.firewallHelp") }));
    if (!setup.ready) {
      const see = el("button", { type: "button", className: "pill create see-setup", textContent: t("setup.seeSetup") });
      see.addEventListener("click", () => openStart());
      parts.push(see);
    }
    return parts;
  };

  /** The virtual controller status; on Linux, the setup (checked again each time it opens). */
  const openDriver = () => {
    closePopover();
    const { t } = i18n;
    const d = snapshot.driver;
    // on Linux the setup items say what is missing; the backend's own reason is not translated
    const status = d.ok ? [el("p", { textContent: t("driver.okText", { backend: d.backend ?? "" }) })] : snapshot.setup ? [el("p", { textContent: t("driver.phones") })] : [el("p", { textContent: d.reason ?? "" }), el("code", { textContent: d.fix ?? "" }), el("p", { textContent: t("driver.phones") })];
    const title = t(snapshot.setup ? "setup.start.title" : "driver.title");
    popover = el("section", { className: "popover driver", role: "dialog", ariaLabel: title }, [el("h2", { textContent: title }), ...status, ...(snapshot.setup ? setupSummary(snapshot.setup) : [])]);
    root.append(popover);
  };

  const showDriver = async () => {
    openDriver();
    if (!snapshot.setup) return;
    await bridge.setupCheck();
    await refresh();
    render();
    openDriver();
  };

  const openStart = () => {
    closePopover();
    screen = "start";
    render();
  };

  /** After a check or a run: with everything done, "All set!" and then the main window. */
  const afterSetup = () => {
    if (screen === "start" && snapshot.setup?.ready && !allSet) {
      allSet = true;
      render();
      setTimeout(() => {
        allSet = false;
        screen = "main";
        render();
      }, o.allSetMs ?? ALL_SET_MS);
      return;
    }
    render();
  };

  const runConfigure = async (items: SetupItem["id"][] | null) => {
    setupBusy = true;
    render();
    try {
      const result = await bridge.setupConfigure(items);
      await refresh();
      if (result.setup) snapshot = { ...snapshot, setup: result.setup };
      if (result.portsMoved) showNotice(i18n.t("notice.portsMoved"));
    } finally {
      setupBusy = false;
    }
    afterSetup();
  };

  /** The start screen follows the system: items done by hand in a terminal turn green too. */
  let checking = false;
  /** the setup the start screen shows, to redraw only when it changed */
  let shownSetup = "";
  const checkSetup = async () => {
    if (checking || setupBusy) return;
    checking = true;
    try {
      await bridge.setupCheck();
      await refresh();
      if (JSON.stringify(snapshot.setup) !== shownSetup || snapshot.setup?.ready) afterSetup();
    } finally {
      checking = false;
    }
  };

  const skipSetup = () => {
    screen = "main";
    void setSettings({ setup: { ...snapshot.settings.setup, skippedRecommended: true } });
    render();
  };

  const startScreen = () => {
    shownSetup = JSON.stringify(snapshot.setup);
    return renderStartScreen({
      i18n,
      setup: snapshot.setup!,
      settings: snapshot.settings,
      busy: setupBusy,
      open: openItems,
      allSet,
      configure: (items) => void runConfigure(items),
      copy: copyText,
      skip: skipSetup,
      ignore: (item, on) => {
        const ignored = snapshot.settings.setup.ignored.filter((i) => i !== item);
        void setSettings({ setup: { ...snapshot.settings.setup, ignored: on ? [...ignored, item] : ignored } });
        render();
      },
    });
  };

  /** In place of the empty list while Linux does not let Ninjoy create controllers. */
  const permissionNeeded = () => {
    const { t } = i18n;
    const see = el("button", { type: "button", className: "pill create see-setup", textContent: t("setup.seeSetup") });
    see.addEventListener("click", () => openStart());
    return el("div", { className: "empty-view permission" }, [
      el("div", {}, [el("div", { className: "ninja", innerHTML: logoNinja }), el("h2", { textContent: t("permission.title") }), el("p", { textContent: t("permission.text"), style: "margin:6px 0 16px" }), see]),
    ]);
  };

  /** The first close explains that Ninjoy stays in the tray (once per computer). */
  const close = () => {
    if (!snapshot.settings.closeToTray) return bridge.close();
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
      detail.replaceChildren(controllersMissing(snapshot.setup) ? permissionNeeded() : renderEmpty(ctx));
      return;
    }
    if (!details || details.number !== c.number || details.status !== c.status) {
      details = renderDetails(ctx, c);
      detail.replaceChildren(details.el);
    }
    details.update(c, latency.get(c.number) ?? [], now(), (id) => snapshot.skins.find((s) => s.id === id));
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
    // on Linux the chip speaks for every setup item, not only the controllers
    const ok = snapshot.setup ? pendingItems(snapshot.setup, snapshot.settings).length === 0 : snapshot.driver.ok;
    const chipText = snapshot.setup ? (ok ? "setup.chip.ok" : "setup.chip.missing") : ok ? "driver.ok" : "driver.missing";
    const driver = el("button", { type: "button", className: `chip${ok ? "" : " warn"}` }, [el("span", { className: "dot" }), t(chipText)]);
    driver.dataset.popover = "driver";
    driver.addEventListener("click", () => (popover?.classList.contains("driver") ? closePopover() : void showDriver()));
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
      ...(screen === "main" ? [el("nav", { className: "seg tabs", ariaLabel: "Ninjoy" }, [tab("controllers", t("tab.controllers")), tab("skins", t("tab.skins"))])] : []),
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

    const create = el("button", { type: "button", className: "pill create", disabled: controllersMissing(snapshot.setup) }, [html(icons.plus), t("create")]);
    create.addEventListener("click", async () => {
      const n = await bridge.create();
      await refresh();
      select(n);
    });
    const list = el("aside", { className: "panel list" }, [el("header", {}, [el("h2", { textContent: t("list.title") }), count]), items, create]);
    const main = el("div", { className: "main" }, [list, detail]);

    details = null; // texts change with the language
    const skins = () =>
      renderSkins({ i18n, bridge, skins: snapshot.skins, onDefault: (id) => void setSettings({ defaultSkin: id }).then(() => refresh()) });
    app.replaceChildren(titlebar, screen === "start" && snapshot.setup ? startScreen() : page === "controllers" ? main : skins());
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
    if (page === "skins") {
      const grid = app.querySelector(".skins");
      if (grid) grid.replaceWith(renderSkins({ i18n, bridge, skins: snapshot.skins, onDefault: (id) => void setSettings({ defaultSkin: id }).then(() => refresh()) }));
    }
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

  /** One second: latency samples, and every other second the start screen checks the system. */
  let ticks = 0;
  const tick = async () => {
    await refresh(true);
    if (screen === "start" && ++ticks % 2 === 0) await checkSetup();
  };

  applyTheme(snapshot.settings.theme);
  render();
  // phones are only offered skins that pass the skin format rules
  void checkLibrary(bridge, snapshot.skins, i18n.locale).then(() => refresh());
  const stop = bridge.onChanged(() => void refresh());
  let timer = 0;
  let raf = 0;
  if (o.timers ?? true) {
    timer = window.setInterval(() => void tick(), 1000);
    const loop = (time: number) => {
      void frame(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return {
    refresh,
    /** one second: refresh with latency samples */
    tick,
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
