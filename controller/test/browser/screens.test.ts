import { afterEach, describe, expect, it } from "vitest";
import { createScreens } from "../../src/ui/screens.ts";
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
