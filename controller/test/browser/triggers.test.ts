import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { inlineSkin, mount, pressed, touch } from "./helpers.ts";

const rect = (id = "base") => `<rect id="${id}" width="100" height="100" fill="#123"/>`;
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const tuning = { maxZone: 0.25, minForce: 0 };

/** Four 100 × 100 square triggers, one per direction, and a trigger made of two bases. */
async function triggerSkin(extra: object = {}) {
  const make = (id: string, trigger: string, direction: string, x: number) => ({
    id, type: "trigger", trigger, direction, svg: `${id}.svg`, tuning,
    box: { x, y: 100, width: 100, height: 100 },
    elements: { base: { role: "base", colors: { active: "#ff0000" } } },
    ...extra,
  });
  return inlineSkin(
    {
      name: "Trigger test",
      controls: [
        make("up", "l2", "up", 100), make("down", "r2", "down", 300), make("left", "l2", "left", 500), make("right", "r2", "right", 700),
        { id: "two", type: "trigger", trigger: "l2", direction: "up", svg: "two.svg", tuning, box: { x: 900, y: 100, width: 100, height: 100 }, elements: { a: { role: "base" }, b: { role: "base" } } },
      ],
    },
    {
      "up.svg": svg(rect()), "down.svg": svg(rect()), "left.svg": svg(rect()), "right.svg": svg(rect()),
      "two.svg": svg('<rect id="a" width="100" height="40" fill="#123"/><rect id="b" y="60" width="100" height="40" fill="#123"/>'),
    },
  );
}

describe("triggers (US3)", () => {
  let controller: Controller;
  let root: HTMLElement;

  const start = async (extra?: object) => {
    root = mount(1600, 720);
    controller = createController({ skin: await triggerSkin(extra), root, storage: null });
    controller.updateSettings({ size: 1, finger: 0 });
  };
  const fill = (id: string) => root.querySelector(`[data-control="${id}"] [data-fill]`)!;
  const zone = (id: string) => root.querySelector(`[data-control="${id}"] [data-max-zone]`)!;
  afterEach(() => controller.dispose());

  it("takes the force from the finger position along each direction", async () => {
    await start();
    const cases: [string, "l2" | "r2", number, number][] = [
      ["up", "l2", 150, 160], // 40% from the bottom
      ["down", "r2", 350, 140], // 40% from the top
      ["left", "l2", 560, 150], // 40% from the right
      ["right", "r2", 740, 150], // 40% from the left
    ];
    for (const [, which, x, y] of cases) {
      const finger = touch(root).down(x, y);
      expect(controller.state.triggers[which]).toBeCloseTo(0.5333, 3);
      expect(pressed(controller)).toEqual([which]);
      finger.up();
      expect(controller.state.triggers[which]).toBe(0);
    }
    const top = touch(root).down(150, 115);
    expect(controller.state.triggers.l2).toBe(1);
    top.up();
  });

  it("follows the last finger that entered, then the previous one", async () => {
    await start();
    const low = touch(root).down(150, 180); // 20%
    const high = touch(root).down(150, 140); // 60%
    expect(controller.state.triggers.l2).toBeCloseTo(0.6 / 0.75, 5);
    high.up();
    expect(controller.state.triggers.l2).toBeCloseTo(0.2 / 0.75, 5);
    low.up();
    expect(controller.state.triggers.l2).toBe(0);
  });

  it("shows the fill and the 100% zone only while pressed, growing with force", async () => {
    await start();
    expect(fill("up").getAttribute("fill-opacity")).toBe("0");
    expect(zone("up").getAttribute("fill-opacity")).toBe("0");
    const finger = touch(root).down(150, 160);
    const force = 0.4 / 0.75;
    expect(Number(fill("up").getAttribute("fill-opacity"))).toBeCloseTo(0.3 + 0.7 * force, 5);
    expect(Number(zone("up").getAttribute("fill-opacity"))).toBeCloseTo(0.12 + 0.88 * force ** 3, 5);
    expect(Number(fill("up").getAttribute("height"))).toBeCloseTo(40, 1);
    expect(Number(fill("up").getAttribute("y"))).toBeCloseTo(60, 1);
    finger.up();
    expect(fill("up").getAttribute("fill-opacity")).toBe("0");
    expect(zone("up").getAttribute("fill-opacity")).toBe("0");
  });

  it("cuts the fill to the union of every base shape", async () => {
    await start();
    const mask = root.querySelector('[data-control="two"] mask')!;
    expect(mask.querySelectorAll("rect")).toHaveLength(2);
    // the fill sits above the last base
    const b = root.querySelector('[data-control="two"] [data-el="b"]')!;
    expect(b.nextElementSibling?.nextElementSibling?.hasAttribute("data-trigger-fill")).toBe(true);
  });

  it("uses the normal active look when the skin hides the fill", async () => {
    await start({ showFill: false });
    expect(root.querySelector('[data-control="up"] [data-trigger-fill]')).toBeNull();
    const base = root.querySelector('[data-control="up"] [data-el="base"]') as SVGElement;
    const finger = touch(root).down(150, 160);
    expect(base.style.fill).toBe("rgb(255, 0, 0)");
    expect(controller.state.triggers.l2).toBeCloseTo(0.5333, 3);
    finger.up();
    expect(base.style.fill).toBe("");
  });

  it("keeps the base color while the fill is shown", async () => {
    await start();
    const base = root.querySelector('[data-control="up"] [data-el="base"]') as SVGElement;
    const finger = touch(root).down(150, 160);
    expect(base.style.fill).toBe("");
    expect(root.querySelector('[data-control="up"]')!.hasAttribute("data-active")).toBe(true);
    finger.up();
  });
});
