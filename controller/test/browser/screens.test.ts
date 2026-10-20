import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createScreens, playSplash, shouldAskToRotate, SPLASH_MS, watchOrientation } from "../../src/ui/screens.ts";
import "../../src/ui/styles.css";

describe("notice screens", () => {
  let parent: HTMLElement;
  afterEach(() => parent?.remove());

  const mount = () => {
    parent = document.createElement("div");
    document.body.append(parent);
    return createScreens(parent);
  };

  it("shows the logo, the message and the action buttons, and hides again", () => {
    const screens = mount();
    let clicked = 0;
    screens.show({ message: "The host disconnected you.", buttons: [{ label: "Join again", onClick: () => clicked++, primary: true }] });
    const screen = parent.querySelector<HTMLElement>(".nj-screen")!;
    expect(screen.hidden).toBe(false);
    expect(screen.querySelector(".nj-screen-logo svg")).not.toBeNull();
    expect(screen.querySelector(".nj-screen-message")!.textContent).toBe("The host disconnected you.");
    const button = screen.querySelector<HTMLButtonElement>(".nj-screen-button.primary")!;
    expect(button.textContent).toBe("Join again");
    button.click();
    expect(clicked).toBe(1);
    screens.hide();
    expect(screen.hidden).toBe(true);
  });

  it("pulses waiting messages and covers the whole screen above the controller", () => {
    const screens = mount();
    screens.show({ message: "Connecting to Ninjoy…", pulse: true });
    const screen = parent.querySelector<HTMLElement>(".nj-screen")!;
    expect(screen.querySelector(".nj-screen-message.pulse")).not.toBeNull();
    const style = getComputedStyle(screen);
    expect(style.position).toBe("fixed");
    expect(Number(style.zIndex)).toBeGreaterThan(20);
  });

  it("shows a short toast with the controller number", async () => {
    const screens = mount();
    screens.toast("Controller 3", 50);
    const toast = parent.querySelector<HTMLElement>(".nj-toast")!;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe("Controller 3");
    await new Promise((r) => setTimeout(r, 80));
    expect(toast.hidden).toBe(true);
  });
});

describe("splash and orientation (US7)", () => {
  it("plays a short splash that never blocks touches and then goes away", async () => {
    const started = performance.now();
    const done = playSplash();
    const splash = document.querySelector<HTMLElement>(".nj-splash")!;
    expect(splash.querySelector("svg")).not.toBeNull();
    expect(getComputedStyle(splash).pointerEvents).toBe("none");
    await done;
    expect(performance.now() - started).toBeGreaterThanOrEqual(SPLASH_MS - 20);
    expect(SPLASH_MS).toBeLessThanOrEqual(1600);
    expect(document.querySelector(".nj-splash")).toBeNull();
  });

  it("asks phones held upright to turn, but not tablets", () => {
    expect(shouldAskToRotate(390, 844)).toBe(true);
    expect(shouldAskToRotate(844, 390)).toBe(false);
    expect(shouldAskToRotate(820, 1180)).toBe(false);
    expect(shouldAskToRotate(1180, 820)).toBe(false);
  });

  it("shows the notice when a phone is turned upright and hides it again", async () => {
    await page.viewport(390, 844);
    const watcher = watchOrientation(() => "Turn your device sideways to play.");
    const notice = document.querySelector<HTMLElement>(".nj-rotate")!;
    expect(notice.hidden).toBe(true); // lists and notices may be used upright
    watcher.setActive(true); // the controller is on screen
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("Turn your device sideways");
    await page.viewport(844, 390);
    watcher.update();
    expect(notice.hidden).toBe(true);
    await page.viewport(820, 1180);
    watcher.update();
    expect(notice.hidden).toBe(true);
    watcher.dispose();
  });

  it("uses only files served with the page (no internet)", () => {
    const external = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((url) => !url.startsWith(location.origin) && !url.startsWith("data:") && !url.startsWith("blob:"));
    expect(external).toEqual([]);
  });
});
