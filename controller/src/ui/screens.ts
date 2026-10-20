import "@fontsource-variable/manrope";
import "@fontsource/chakra-petch/600.css";
import logoFull from "../../../assets/brand/logo-full.svg?raw";
import logoWord from "../../../assets/brand/logo-word.svg?raw";
import { el } from "./widgets.ts";

/**
 * Background tile: NINJOY wordmarks laid like bricks — two rows, the second shifted by half a
 * word, with room around each word.
 */
const patternTile = (() => {
  const [, , w, h] = (logoWord.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 693 202").split(/\s+/).map(Number) as [number, number, number, number];
  const inner = logoWord.slice(logoWord.indexOf(">") + 1, logoWord.lastIndexOf("</svg>"));
  const padX = w * 0.25, padY = h * 0.9;
  const tileW = w + 2 * padX, rowH = h + 2 * padY;
  const word = (x: number, y: number) => `<g transform="translate(${x} ${y})">${inner}</g>`;
  // the shifted row crosses the tile edge, so it is drawn on both sides to tile seamlessly
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tileW} ${2 * rowH}" fill="currentColor" fill-rule="evenodd">`
    + word(padX, padY)
    + word(padX + tileW / 2, rowH + padY)
    + word(padX - tileW / 2, rowH + padY)
    + "</svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

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
  root.style.setProperty("--nj-pattern", patternTile);
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

/** Length of the opening splash. */
export const SPLASH_MS = 1500;

/**
 * The opening: the logo fades in, zooms quickly to a very large size while fading out, and the
 * controller (or the connection notice) is there underneath. Never blocks touches.
 */
export function playSplash(parent: HTMLElement = document.body): Promise<void> {
  const splash = el("div", { className: "nj-splash" }, [el("div", { className: "nj-splash-logo", innerHTML: logoFull })]);
  parent.append(splash);
  return new Promise((resolve) => {
    setTimeout(() => {
      splash.remove();
      resolve();
    }, SPLASH_MS);
  });
}

/** Phones held upright (shortest side under 600 CSS px) are asked to turn; tablets may stay upright. */
export function shouldAskToRotate(width: number, height: number): boolean {
  return height > width && width < 600;
}

/** The "turn your device sideways" notice, shown over everything while it applies. */
export function watchOrientation(message: () => string, parent: HTMLElement = document.body) {
  const notice = el("div", { className: "nj-screen nj-rotate" });
  notice.style.setProperty("--nj-pattern", patternTile);
  const update = () => {
    const ask = shouldAskToRotate(window.innerWidth, window.innerHeight);
    notice.hidden = !ask;
    if (ask) {
      notice.replaceChildren(
        el("div", { className: "nj-screen-pattern" }),
        el("div", { className: "nj-screen-content" }, [
          el("div", { className: "nj-screen-logo", innerHTML: logoFull }),
          el("p", { className: "nj-screen-message pulse", textContent: message() }),
        ]),
      );
    }
  };
  parent.append(notice);
  update();
  window.addEventListener("resize", update);
  return {
    update,
    dispose() {
      window.removeEventListener("resize", update);
      notice.remove();
    },
  };
}
