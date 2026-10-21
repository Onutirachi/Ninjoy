import { describe, expect, it } from "vitest";
import { createI18n } from "../../src/i18n/index.ts";
import { explainLinks, renderExplain, secureReachable } from "../../src/ui/explain.ts";

const target = { hostname: "192.168.0.10", pathname: "/3", port: "", securePort: 443 };

describe("plain-address explanation page", () => {
  it("links to the secure controller of the same slot and to the plain one", () => {
    expect(explainLinks(target)).toEqual({ secure: "https://192.168.0.10/3", plain: "http://192.168.0.10/3?plain" });
    expect(explainLinks({ ...target, pathname: "/", port: "8080", securePort: 8443 })).toEqual({
      secure: "https://192.168.0.10:8443/",
      plain: "http://192.168.0.10:8080/?plain",
    });
  });

  it("explains the warning in English and Portuguese", () => {
    const en = renderExplain(createI18n("en"), target);
    expect(en.querySelector("h1")!.textContent).toBe("Open the Ninjoy controller");
    expect(en.textContent).toContain("Android: tap “Advanced”");
    expect(en.querySelector<HTMLAnchorElement>("a.primary")!.href).toBe("https://192.168.0.10/3");
    expect(en.querySelector<HTMLAnchorElement>("a.nj-explain-plain")!.textContent).toBe("Continue without motion sensors");
    const pt = renderExplain(createI18n("pt"), target);
    expect(pt.querySelector("h1")!.textContent).toBe("Abrir o controle Ninjoy");
    expect(pt.textContent).toContain("iPhone: toque em “Mostrar Detalhes”");
  });

  it("offers only the plain controller when HTTPS is unavailable", () => {
    const page = renderExplain(createI18n("en"), { ...target, securePort: null });
    const links = [...page.querySelectorAll("a")];
    expect(links.map((a) => a.href)).toEqual(["http://192.168.0.10/3?plain"]);
    expect(page.textContent).toContain("not available");
  });

  it("skips the explanation once the phone accepted the certificate", async () => {
    const asked: string[] = [];
    const ok = (async (url: string) => (asked.push(url), new Response())) as unknown as typeof fetch;
    const untrusted = (async () => {
      throw new TypeError("certificate not trusted");
    }) as unknown as typeof fetch;
    const silent = (() => new Promise(() => {})) as unknown as typeof fetch;
    expect(await secureReachable("https://192.168.0.10:8443/3", 50, ok)).toBe(true);
    expect(asked).toEqual(["https://192.168.0.10:8443/skins/index.json"]);
    expect(await secureReachable("https://192.168.0.10/3", 50, untrusted)).toBe(false);
    expect(await secureReachable("https://192.168.0.10/3", 50, silent)).toBe(false); // gives up
  });
});
