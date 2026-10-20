import type { I18n } from "../i18n/index.ts";
import type { SlotListEntry } from "../platform/session.ts";
import { el } from "./widgets.ts";

/**
 * The controller list shown at the bare address: controllers waiting for a device, the ones in
 * use, this device's own held controller first, and "new controller" when the host allows it.
 */
export function renderLobby(o: {
  i18n: I18n;
  entries: SlotListEntry[];
  phonesCanCreate: boolean;
  onPick(slot: number): void;
}): HTMLElement {
  const { t } = o.i18n;
  const card = (slot: number, label: string, sub: string, enabled: boolean, className = "") => {
    const b = el("button", { type: "button", className: `nj-lobby-card ${className}`, disabled: !enabled }, [
      el("span", { className: "nj-lobby-num", textContent: String(slot) }),
      el("span", { className: "nj-lobby-text" }, [el("strong", { textContent: label }), el("small", { textContent: sub })]),
    ]);
    if (enabled) b.addEventListener("click", () => o.onPick(slot));
    return b;
  };

  const mine = o.entries.filter((e) => e.status === "held-for-you");
  const waiting = o.entries.filter((e) => e.status === "waiting");
  const busy = o.entries.filter((e) => e.status === "connected" || e.status === "held");
  const cards = [
    ...mine.map((e) => card(e.slot, t("lobby.back", { n: e.slot }), t("lobby.available"), true, "mine")),
    ...waiting.map((e) => card(e.slot, t("lobby.controller", { n: e.slot }), t("lobby.available"), true)),
    ...busy.map((e) => card(e.slot, t("lobby.controller", { n: e.slot }), t("lobby.inUse"), false)),
  ];
  if (o.phonesCanCreate) {
    const add = el("button", { type: "button", className: "nj-lobby-card new" }, [
      el("span", { className: "nj-lobby-num", textContent: "+" }),
      el("span", { className: "nj-lobby-text" }, [el("strong", { textContent: t("lobby.new") })]),
    ]);
    add.addEventListener("click", () => o.onPick(0));
    cards.push(add);
  }
  const children: HTMLElement[] = [el("h1", { className: "nj-lobby-title", textContent: t("lobby.title") })];
  if (!o.entries.length && !o.phonesCanCreate) children.push(el("p", { className: "nj-screen-message", textContent: t("lobby.emptyNoCreate") }));
  children.push(el("div", { className: "nj-lobby-grid" }, cards));
  return el("div", { className: "nj-lobby" }, children);
}
