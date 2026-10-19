import { DS4_BUTTONS, type ControllerState } from "../engine/state.ts";
import type { Controller } from "../dom/controller.ts";

// Development tooling: English only, not part of the player-facing UI.

/** Live view of the controller state (`?dev`). */
export function attachDevPanel(controller: Controller, parent: HTMLElement = document.body) {
  const panel = document.createElement("div");
  panel.className = "nj-dev";
  panel.innerHTML = `
    <div class="nj-dev-chips">${[...DS4_BUTTONS, "gyro"].map((b) => `<span data-b="${b}">${b.toUpperCase()}</span>`).join("")}</div>
    <div class="nj-dev-row">
      <div class="nj-dev-pad" title="left stick"><i data-dot="left"></i></div>
      <div class="nj-dev-bars"><b data-bar="l2"></b><b data-bar="r2"></b></div>
      <div class="nj-dev-pad" title="right stick"><i data-dot="right"></i></div>
      <div class="nj-dev-pad nj-dev-touchpad" title="touchpad"><i data-touch="0"></i><i data-touch="1"></i></div>
    </div>
    <pre class="nj-dev-text"></pre>`;
  parent.append(panel);

  const q = <T extends Element>(s: string) => panel.querySelector(s) as T;
  const text = q<HTMLPreElement>(".nj-dev-text");
  const fmt = (v: number) => (v >= 0 ? " " : "") + v.toFixed(2);

  const show = (state: ControllerState) => {
    for (const chip of panel.querySelectorAll<HTMLElement>("[data-b]")) {
      const b = chip.dataset.b!;
      chip.classList.toggle("on", b === "gyro" ? state.gyro : state.buttons.has(b as never));
    }
    for (const side of ["left", "right"] as const) {
      const dot = q<HTMLElement>(`[data-dot="${side}"]`);
      dot.style.left = `${50 + state.sticks[side].x * 45}%`;
      dot.style.top = `${50 + state.sticks[side].y * 45}%`;
    }
    for (const t of ["l2", "r2"] as const) q<HTMLElement>(`[data-bar="${t}"]`).style.height = `${state.triggers[t] * 100}%`;
    for (const i of [0, 1]) {
      const dot = q<HTMLElement>(`[data-touch="${i}"]`);
      const touch = state.touchpad.touches[i];
      dot.style.display = touch ? "" : "none";
      if (touch) Object.assign(dot.style, { left: `${touch.x * 100}%`, top: `${touch.y * 100}%` });
    }
    const m = state.motion;
    text.textContent =
      `seq ${state.seq}  L(${fmt(state.sticks.left.x)},${fmt(state.sticks.left.y)})  R(${fmt(state.sticks.right.x)},${fmt(state.sticks.right.y)})` +
      `  L2 ${state.triggers.l2.toFixed(2)}  R2 ${state.triggers.r2.toFixed(2)}` +
      (m ? `\ngyro ${fmt(m.rate.x)} ${fmt(m.rate.y)} ${fmt(m.rate.z)}  accel ${fmt(m.accel.x)} ${fmt(m.accel.y)} ${fmt(m.accel.z)}` : "");
  };

  show(controller.state);
  const unsubscribe = controller.subscribe(show);
  return {
    dispose() {
      unsubscribe();
      panel.remove();
    },
  };
}
