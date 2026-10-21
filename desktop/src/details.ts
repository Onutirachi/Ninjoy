/** The selected controller: header and actions, QR code, latency and state, live view. */

import type { Bridge, ControllerView, LiveView } from "./bridge.ts";
import { el, html, icons, lightbarCss, shortUrl } from "./dom.ts";
import type { I18n } from "./i18n/index.ts";
import { createMotion, createPad } from "./pad.ts";

export interface DetailsContext {
  bridge: Bridge;
  i18n: () => I18n;
  qr(url: string): Promise<string>;
  preview: string;
  ninja: string;
}

/** Latency now, average and peak over the samples, and the graph path (0–100 × 0–40). */
export function latencyStats(samples: number[]) {
  if (!samples.length) return null;
  const max = 30;
  const pts = samples.map((v, i) => `${samples.length === 1 ? 100 : (i / (samples.length - 1)) * 100},${40 - (Math.min(v, max) / max) * 36}`);
  return {
    now: samples.at(-1)!,
    average: samples.reduce((s, v) => s + v, 0) / samples.length,
    peak: Math.max(...samples),
    line: `M${pts.join(" L")}`,
    fill: `M0,40 L${pts.join(" L")} L100,40 Z`,
  };
}

export function renderEmpty(ctx: DetailsContext): HTMLElement {
  const { t } = ctx.i18n();
  return el("div", { className: "empty-view" }, [
    el("div", {}, [el("div", { className: "ninja", innerHTML: ctx.ninja }), el("h2", { textContent: t("empty.title") }), el("p", { textContent: t("empty.hint"), style: "margin-top:6px" })]),
  ]);
}

/** A controller's details; `update` refreshes the changing parts without rebuilding. */
export function renderDetails(ctx: DetailsContext, c: ControllerView) {
  const { t } = ctx.i18n();
  const root = el("div", { className: "detail-content" });
  root.style.display = "contents";
  const meta = el("p", { className: "meta" });
  const waiting = c.status === "waiting";

  const padChip = el("span", { className: "pill" });
  const action = el("button", { className: "pill danger", type: "button" }, [html(waiting ? icons.trash : icons.leave), el("span", { textContent: t(waiting ? "action.remove" : "action.kick") })]);
  action.addEventListener("click", () => void (waiting ? ctx.bridge.remove(c.number) : ctx.bridge.kick(c.number)));
  root.append(
    el("div", { className: "detail-head" }, [
      el("span", { className: "bar" }),
      el("div", {}, [el("h1", { textContent: t("detail.title", { n: c.number }) }), meta]),
      el("div", { className: "actions" }, [padChip, action]),
    ]),
  );

  const qr = (size: string) => {
    const box = el("div", { className: `qr ${size}` });
    void ctx.qr(c.url).then((svg) => (box.innerHTML = svg));
    return box;
  };
  const addresses = () => el("div", { className: "addr" }, [shortUrl(c.url), ...(c.nameUrl ? [el("small", { textContent: shortUrl(c.nameUrl) })] : [])]);

  const values = {
    latency: el("dd"),
    average: el("dd"),
    peak: el("dd"),
    gyro: el("dd"),
    vibration: el("dd"),
    lightbar: el("dd"),
    skin: el("dd"),
  };
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.classList.add("line");
  const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
  fill.classList.add("fill");
  const spark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  spark.classList.add("spark");
  spark.setAttribute("viewBox", "0 0 100 40");
  spark.setAttribute("preserveAspectRatio", "none");
  spark.append(fill, line);

  const pad = createPad();
  const motion = createMotion(ctx.preview, () => ctx.i18n().t("motion.off"));

  if (waiting) {
    root.append(el("div", { className: "waiting-view" }, [el("div", {}, [qr("big"), el("h1", { textContent: t("waiting.title") }), el("p", { textContent: t("waiting.hint") }), addresses()])]));
  } else {
    const row = (key: Parameters<I18n["t"]>[0], dd: HTMLElement) => [el("dt", { textContent: t(key) }), dd];
    root.append(
      el("div", { className: "quad" }, [
        el("section", { className: "area qr-area" }, [qr(""), addresses()]),
        el("section", { className: "area info-area" }, [
          el("dl", { className: "info" }, [
            ...row("info.latency", values.latency),
            ...row("info.average", values.average),
            ...row("info.peak", values.peak),
            ...row("info.gyro", values.gyro),
            ...row("info.vibration", values.vibration),
            ...row("info.lightbar", values.lightbar),
            ...row("info.skin", values.skin),
          ]),
          spark,
        ]),
      ]),
      el("div", { className: "duo" }, [el("section", { className: "area live-area" }, [pad.el]), motion.el]),
    );
  }

  return {
    el: root,
    status: c.status,
    number: c.number,
    update(c: ControllerView, samples: number[], now: number, skinName: (id: string) => string = (id) => id) {
      const { t } = ctx.i18n();
      values.skin.textContent = c.skin ? skinName(c.skin) : "—";
      const device = c.device ?? "";
      if (c.status === "waiting") meta.textContent = t("detail.waiting");
      else if (c.status === "reconnecting") meta.textContent = t("detail.reconnecting", { device, n: c.holdLeft ?? 0 });
      else {
        const minutes = c.connectedSince ? Math.floor((now - c.connectedSince) / 60000) : 0;
        meta.textContent = minutes < 1 ? t("detail.connectedNow", { device }) : t("detail.connectedFor", { device, n: minutes });
      }
      root.parentElement?.style.setProperty("--lightbar", lightbarCss(c.lightbar, c.number));
      padChip.replaceChildren(html(icons.gamepad), t(c.pad === "plugged" ? "pad.plugged" : "pad.missing"));
      padChip.title = c.padError ?? "";
      const stats = latencyStats(samples);
      const ms = (v: number) => t("value.ms", { n: Math.round(v) });
      values.latency.textContent = c.status === "connected" && stats ? ms(stats.now) : "—";
      values.average.textContent = stats ? ms(stats.average) : "—";
      values.peak.textContent = stats ? ms(stats.peak) : "—";
      line.setAttribute("d", stats?.line ?? "");
      fill.setAttribute("d", stats?.fill ?? "");
      values.gyro.textContent = t(c.gyro ? "value.on" : "value.off");
      const rumbling = !!c.rumble && (c.rumble[0] > 0 || c.rumble[1] > 0);
      values.vibration.textContent = t(rumbling ? "value.rumbling" : "value.still");
      values.lightbar.replaceChildren(el("span", { className: "swatch", style: `background:${lightbarCss(c.lightbar, c.number)}` }), c.lightbar ? `#${c.lightbar.map((v) => v.toString(16).padStart(2, "0")).join("")}` : "—");
    },
    live(s: LiveView | null, now: number) {
      pad.update(s);
      motion.update(s, now);
    },
  };
}
