// The page the host shows on its plain (non-secure) address: explains the one-time certificate
// warning and links to the secure controller, or to the plain one without motion sensors.
import { createI18n, detectLanguage, type I18n } from "../i18n/index.ts";
import { slotFromPath } from "../platform/session.ts";
import { createScreens } from "./screens.ts";
import { el } from "./widgets.ts";
import "./styles.css";

export interface ExplainTarget {
  hostname: string;
  pathname: string;
  /** the plain server's port ("" = 80) */
  port: string;
  /** the secure server's port; null = HTTPS unavailable */
  securePort: number | null;
}

/** The two addresses the explanation offers. */
export function explainLinks(t: ExplainTarget) {
  const slot = slotFromPath(t.pathname);
  const path = slot ? `/${slot}` : "/";
  const secure = t.securePort === null ? null : `https://${t.hostname}${t.securePort === 443 ? "" : `:${t.securePort}`}${path}`;
  const plain = `http://${t.hostname}${t.port && t.port !== "80" ? `:${t.port}` : ""}${path}?plain`;
  return { secure, plain };
}

export function renderExplain(i18n: I18n, target: ExplainTarget): HTMLElement {
  const { t } = i18n;
  const links = explainLinks(target);
  const link = (href: string, label: string, className: string) => el("a", { href, className, textContent: label });
  return el("div", { className: "nj-explain" }, [
    el("h1", { textContent: t("explain.title") }),
    ...(links.secure
      ? [
          el("p", { textContent: t("explain.why") }),
          el("ul", {}, [el("li", { textContent: t("explain.android") }), el("li", { textContent: t("explain.iphone") })]),
          el("p", { className: "nj-explain-once", textContent: t("explain.once") }),
          el("div", { className: "nj-screen-buttons" }, [link(links.secure, t("explain.open"), "nj-screen-button primary")]),
        ]
      : [el("p", { textContent: t("explain.noSecure") })]),
    link(links.plain, t("explain.plain"), links.secure ? "nj-explain-plain" : "nj-screen-button primary"),
  ]);
}

/**
 * Whether this phone already accepted the PC's certificate: a request to the secure address
 * only gets through once it did (an untrusted certificate fails the request).
 */
export async function secureReachable(secure: string, timeoutMs = 2000, request: typeof fetch = fetch): Promise<boolean> {
  const probe = new URL("/skins/index.json", secure).href;
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  const attempt = request(probe, { mode: "no-cors", cache: "no-store" }).then(
    () => true,
    () => false,
  );
  return Promise.race([attempt, timeout]);
}

function securePortFromPage(): number | null {
  const value = document.querySelector<HTMLMetaElement>('meta[name="ninjoy-secure-port"]')?.content ?? "";
  if (value === "") return 443; // development server
  if (value === "none") return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : 443;
}

if (document.getElementById("app")) {
  const i18n = createI18n(detectLanguage("auto", navigator.languages));
  document.documentElement.lang = i18n.locale;
  const screens = createScreens();
  const { hostname, pathname, port } = location;
  const target = { hostname, pathname, port, securePort: securePortFromPage() };
  const { secure } = explainLinks(target);
  // the QR code and typed addresses land here: phones that already accepted the certificate go
  // straight to the controller, the others first learn about the warning
  screens.show({ message: i18n.t("session.connecting"), pulse: true });
  void (secure ? secureReachable(secure) : Promise.resolve(false)).then((ok) => {
    if (ok && secure) location.replace(secure);
    else screens.show({ body: renderExplain(i18n, target) });
  });
}
