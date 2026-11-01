/** The Linux start screen: what the system still needs, each item explained, and one Configure. */

import type { SetupItem, SetupView, Settings } from "./bridge.ts";
import { el } from "./dom.ts";
import type { I18n, MessageKey } from "./i18n/index.ts";

export interface StartScreenOptions {
  i18n: I18n;
  setup: SetupView;
  settings: Settings;
  /** a password prompt is open */
  busy: boolean;
  /** items whose details are open (kept across the periodic checks) */
  open: Set<SetupItem["id"]>;
  /** every item is done: "All set!" before the main window */
  allSet: boolean;
  /** applies the missing items, or only `items` */
  configure(items: SetupItem["id"][] | null): void;
  copy(commands: string): Promise<boolean>;
  skip(): void;
  /** ignores a Recommended item, or counts it again */
  ignore(item: SetupItem["id"], on: boolean): void;
}

/** A missing Recommended item the user chose to ignore (Critical items cannot be ignored; a done item is just done). */
export function isIgnored(item: SetupItem, settings: Settings): boolean {
  return item.state !== "done" && !item.critical && settings.setup.ignored.includes(item.id);
}

/** The items still missing, leaving out the ignored ones. */
export function pendingItems(setup: SetupView | null, settings: Settings): SetupItem[] {
  return setup ? setup.items.filter((i) => i.state !== "done" && !isIgnored(i, settings)) : [];
}

/** Whether the app opens on the start screen (Linux, something missing, not skipped). */
export function wantsStartScreen(setup: SetupView | null, settings: Settings): boolean {
  const missing = pendingItems(setup, settings);
  return missing.some((i) => i.critical) || (missing.length > 0 && !settings.setup.skippedRecommended);
}

/** Linux does not let Ninjoy create virtual controllers yet. */
export function controllersMissing(setup: SetupView | null): boolean {
  return !!setup?.items.some((i) => i.id === "controllers" && i.state !== "done");
}

/** The items in the order they are shown: Critical ones first. */
export function orderedItems(setup: SetupView): SetupItem[] {
  return [...setup.items].sort((a, b) => Number(b.critical) - Number(a.critical));
}

/** The values an item's texts name: the firewall, and the ports it opens or allows. */
function itemParams(item: SetupItem, settings: Settings): Record<string, string | number> {
  const custom = settings.ports.mode === "custom";
  const secure = custom ? settings.ports.secure : 443;
  const plain = custom ? settings.ports.plain : 80;
  const low = Math.min(...[secure, plain].filter((p) => p < 1024));
  return { firewall: item.firewall ?? "", secure, plain, port: Number.isFinite(low) ? low : plain };
}

/** A terminal block: command output and commands stay exactly as the system prints them. */
export function terminal(text: string): HTMLElement {
  return el("code", { className: "terminal", textContent: text });
}

export function renderStartScreen(o: StartScreenOptions): HTMLElement {
  const { t } = o.i18n;
  const k = (key: string) => key as MessageKey;

  if (o.allSet) {
    return el("section", { className: "start all-set" }, [el("div", { className: "start-card" }, [el("h1", { textContent: t("setup.allSet") }), el("p", { textContent: t("setup.allSetText") })])]);
  }

  const copyButton = (className: string, commands: string) => {
    const copy = el("button", { type: "button", className: `pill copy${className}`, textContent: t("setup.copy") });
    copy.addEventListener("click", async () => {
      if (await o.copy(commands)) copy.textContent = t("setup.copied");
    });
    return copy;
  };

  const items = orderedItems(o.setup).map((item) => {
    const params = itemParams(item, o.settings);
    const ignored = isIgnored(item, o.settings);
    const flag = el("span", { className: `flag${item.critical ? " critical" : ""}`, textContent: t(item.critical ? "setup.flag.critical" : "setup.flag.recommended") });
    const summary = el("summary", {}, [
      el("span", { className: "state", title: t(k(`setup.state.${item.state}`)), ariaLabel: t(k(`setup.state.${item.state}`)) }),
      el("span", { className: "what" }, [el("span", { className: "title" }, [el("b", { textContent: t(k(`setup.${item.id}.title`), params) }), flag]), el("span", { className: "summary", textContent: t(k(`setup.${item.id}.text`), params) })]),
    ]);
    // a Recommended item still missing can be ignored; the switch does not open the card
    if (!item.critical && item.state !== "done") {
      const box = el("input", { type: "checkbox", className: "switch", checked: ignored, role: "switch" });
      box.addEventListener("change", () => o.ignore(item.id, box.checked));
      summary.append(el("label", { className: "ignore" }, [t("setup.ignore"), box]));
    }
    const body = el("div", { className: "body" }, [
      ...t(k(`setup.${item.id}.details`), params)
        .split("\n")
        .map((line) => el("p", { textContent: line })),
    ]);
    if (item.state === "failed") body.append(el("p", { className: "reason", textContent: t("setup.failed") }), terminal(item.reason ?? ""));
    body.append(el("p", { className: "label", textContent: t("setup.commands") }), terminal(item.commands.join("\n")));
    const actions = el("div", { className: "actions" });
    if (item.state !== "done") {
      const apply = el("button", { type: "button", className: "pill create apply", textContent: t("setup.apply"), disabled: o.busy });
      apply.addEventListener("click", () => o.configure([item.id]));
      actions.append(apply);
    }
    actions.append(copyButton("", item.commands.join("\n")));
    body.append(actions);
    const details = el("details", { className: "setup-item", open: o.open.has(item.id) }, [summary, body]);
    details.dataset.item = item.id;
    details.dataset.state = item.state;
    if (ignored) details.dataset.ignored = "";
    details.addEventListener("toggle", () => (details.open ? o.open.add(item.id) : o.open.delete(item.id)));
    return details;
  });

  const parts: HTMLElement[] = [el("h1", { textContent: t("setup.start.title") }), el("div", { className: "setup-list" }, items)];
  if (!o.setup.items.some((i) => i.id === "firewall")) parts.push(el("p", { className: "firewall-help", textContent: t("setup.firewallHelp") }));
  if (o.setup.outcome) parts.push(el("div", { className: "outcome" }, [el("p", { textContent: t(k(`setup.${o.setup.outcome}`)) })]));

  const configure = el("button", { type: "button", className: "pill create configure", textContent: t(o.busy ? "setup.configuring" : "setup.configureAll"), disabled: o.busy });
  // the ignored items stay out of Configure and Copy
  const pending = pendingItems(o.setup, o.settings);
  const anyIgnored = o.setup.items.some((i) => isIgnored(i, o.settings));
  configure.addEventListener("click", () => o.configure(anyIgnored ? pending.map((i) => i.id) : null));
  const copy = copyButton(" all", pending.flatMap((i) => i.commands).join("\n"));
  const skip = el("button", { type: "button", className: "link skip", textContent: t("setup.continue") });
  skip.addEventListener("click", () => o.skip());
  parts.push(el("div", { className: "actions" }, [configure, copy]), skip);

  return el("section", { className: "start" }, [el("div", { className: "start-card" }, parts)]);
}
