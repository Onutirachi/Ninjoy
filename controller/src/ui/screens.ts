import "@fontsource-variable/manrope";
import "@fontsource/chakra-petch/600.css";
import logoFull from "../../../assets/brand/logo-full.svg?raw";
import ninjaUrl from "../../../assets/brand/logo-ninja.svg?url";
import { el } from "./widgets.ts";

export interface ScreenButton {
  label: string;
  onClick(): void;
  primary?: boolean;
}

export interface ScreenContent {
  message?: string;
  /** the message breathes (waiting states) */
  pulse?: boolean;
  buttons?: ScreenButton[];
  /** extra content under the message (the controller list) */
  body?: HTMLElement;
}

/**
 * Full-screen notices over the controller: the Ninjoy logo, a short message, optional buttons,
 * over a slowly moving background of Ninjoy's own artwork.
 */
export function createScreens(parent: HTMLElement = document.body) {
  const root = el("div", { className: "nj-screen" });
  root.style.setProperty("--nj-pattern", `url("${ninjaUrl}")`);
  root.hidden = true;
  const content = el("div", { className: "nj-screen-content" });
  root.append(el("div", { className: "nj-screen-pattern" }), content);
  parent.append(root);

  const toast = el("div", { className: "nj-toast" });
  toast.hidden = true;
  parent.append(toast);
  let toastTimer = 0;

  return {
    get visible() { return !root.hidden; },
    show(c: ScreenContent) {
      const logo = el("div", { className: "nj-screen-logo", innerHTML: logoFull });
      const children: HTMLElement[] = [logo];
      if (c.message) children.push(el("p", { className: c.pulse ? "nj-screen-message pulse" : "nj-screen-message", textContent: c.message }));
      if (c.body) children.push(c.body);
      if (c.buttons?.length) {
        children.push(el("div", { className: "nj-screen-buttons" }, c.buttons.map((b) => {
          const button = el("button", { type: "button", className: b.primary ? "nj-screen-button primary" : "nj-screen-button", textContent: b.label });
          button.addEventListener("click", b.onClick);
          return button;
        })));
      }
      content.replaceChildren(...children);
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      content.replaceChildren();
    },
    /** A short message over the controller (e.g. "Controller 3"). */
    toast(text: string, ms = 1800) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => (toast.hidden = true), ms);
    },
  };
}

export type Screens = ReturnType<typeof createScreens>;
