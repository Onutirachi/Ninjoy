import type { I18n } from "../i18n/index.ts";
import { el } from "./widgets.ts";

/**
 * The "tap to play" screen shown once after joining: the tap is what lets the browser keep the
 * screen on, vibrate and (on iPhone) ask for the motion sensors.
 */
export function renderStart(o: { i18n: I18n; slot: number; onStart(): void }): HTMLElement {
  const { t } = o.i18n;
  const play = el("button", { type: "button", className: "nj-start-button", textContent: t("start.play") });
  play.addEventListener("click", () => o.onStart(), { once: true });
  return el("div", { className: "nj-start" }, [
    el("p", { className: "nj-start-slot", textContent: t("session.joined", { n: o.slot }) }),
    play,
    // the page cannot lock the orientation without fullscreen; turning the phone flips the screen
    el("p", { className: "nj-start-tip", textContent: t("start.rotateTip") }),
  ]);
}
