/** The selected controller: header and actions, the QR code while waiting, then cards (latency,
 * skin, address), the lightbar split, the input history and the live view with the turning phone. */

import type { Bridge, ControllerView, LiveView, SkinView } from "./bridge.ts";
import { el, html, icons, lightbarCss, shortUrl } from "./dom.ts";
import type { I18n } from "./i18n/index.ts";
import { createMotion, createPad } from "./pad.ts";
import { createHistory } from "./history.ts";
import { skinPreview } from "./skins.ts";

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
  const addresses = (className: string) => el("div", { className }, [shortUrl(c.url), ...(c.nameUrl ? [el("small", { textContent: shortUrl(c.nameUrl) })] : [])]);
  root.append(
    el("div", { className: "detail-head" }, [
      el("span", { className: "bar" }),
      el("div", {}, [el("h1", { textContent: t("detail.title", { n: c.number }) }), meta]),
      el("div", { className: "actions" }, [padChip, action]),
    ]),
  );

  // latency: now, average, peak and the recent graph
  const latencyNow = el("strong", { className: "big" });
  const latencySummary = el("small");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.classList.add("line");
  const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
  fill.classList.add("fill");
  const spark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  spark.classList.add("spark");
  spark.setAttribute("viewBox", "0 0 100 40");
  spark.setAttribute("preserveAspectRatio", "none");
  spark.append(fill, line);
  // what the player pressed, newest on top
  const history = createHistory();
  // skin: preview and name
  const skinImage = el("img", { alt: "" });
  const skinName = el("strong", { className: "state" });
  const skinAuthor = el("small");

  const card = (className: string, title: Parameters<I18n["t"]>[0], body: Node[]) => el("section", { className: `card ${className}` }, [el("h2", { textContent: t(title) }), ...body]);

  const pad = createPad();
  const motion = createMotion(ctx.preview, () => ctx.i18n().t("motion.off"));

  if (waiting) {
    const qr = el("div", { className: "qr big" });
    void ctx.qr(c.url).then((svg) => (qr.innerHTML = svg));
    root.append(el("div", { className: "waiting-view" }, [el("div", {}, [qr, el("h1", { textContent: t("waiting.title") }), el("p", { textContent: t("waiting.hint") }), addresses("addr")])]));
  } else {
    root.append(
      el("div", { className: "cards" }, [
        card("latency", "card.latency", [el("div", { className: "row" }, [latencyNow, latencySummary]), spark]),
        card("skin", "card.skin", [skinImage, el("div", {}, [skinName, skinAuthor])]),
        card("address", "card.address", [addresses("card-addr")]),
      ]),
      // the split glows with the controller's lightbar, like the bar on the controller
      el("div", { className: "split" }),
      history.el,
      el("div", { className: "duo" }, [el("section", { className: "area live-area" }, [pad.el]), motion.el]),
    );
  }

  let shownSkin: string | null = null;
  return {
    el: root,
    status: c.status,
    number: c.number,
    update(c: ControllerView, samples: number[], now: number, skinOf: (id: string) => SkinView | undefined = () => undefined) {
      const { t } = ctx.i18n();
      const device = c.device ?? "";
      const minutes = c.connectedSince ? Math.floor((now - c.connectedSince) / 60000) : 0;
      if (c.status === "waiting") meta.textContent = t("detail.waiting");
      else if (c.status === "reconnecting") meta.textContent = t("detail.reconnecting", { device, n: c.holdLeft ?? 0 });
      else meta.textContent = minutes < 1 ? t("detail.connectedNow", { device }) : t("detail.connectedFor", { device, n: minutes });

      root.parentElement?.style.setProperty("--lightbar", lightbarCss(c.lightbar, c.number));
      padChip.replaceChildren(html(icons.gamepad), t(c.pad === "plugged" ? "pad.plugged" : "pad.missing"));
      padChip.title = c.padError ?? "";

      const stats = latencyStats(samples);
      const ms = (v: number) => t("value.ms", { n: Math.round(v) });
      latencyNow.textContent = c.status === "connected" && stats ? ms(stats.now) : "—";
      latencySummary.textContent = stats ? t("latency.summary", { average: ms(stats.average), peak: ms(stats.peak) }) : "";
      line.setAttribute("d", stats?.line ?? "");
      fill.setAttribute("d", stats?.fill ?? "");

      const skin = c.skin ? skinOf(c.skin) : undefined;
      skinName.textContent = skin?.name ?? c.skin ?? "—";
      skinAuthor.textContent = skin ? t(skin.bundled ? "skins.official" : "skins.byAuthor", { author: skin.author, version: skin.version }) : "";
      const key = skin ? `${skin.id}@${skin.version}` : null;
      if (key !== shownSkin) {
        shownSkin = key;
        const show = (url: string | null) => {
          skinImage.src = url ?? ctx.preview;
          motion.setPreview(url ?? ctx.preview);
        };
        if (skin) void skinPreview(ctx.bridge, skin).then((url) => shownSkin === key && show(url));
        else show(null);
      }
    },
    live(s: LiveView | null, now: number) {
      pad.update(s);
      history.update(s, now);
      motion.update(s, now);
    },
  };
}
