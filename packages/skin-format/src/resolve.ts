import { BUILTIN, CANVAS } from "./constants.ts";
import type { Manifest, ManifestControl, ResolvedControl, ResolvedSkin } from "./types.ts";
import type { SvgScan } from "./validate/svg.ts";

export interface LoadedControl {
  control: ManifestControl;
  text: string;
  scan: SvgScan;
}

function resolveControl({ control, text }: LoadedControl, manifest: Manifest): ResolvedControl {
  const defaults = manifest.defaults ?? {};
  const resolved: ResolvedControl = {
    id: control.id,
    type: control.type,
    svg: { path: control.svg, text },
    box: { ...control.box },
    anchor: "center",
    group: control.id,
    elements: [],
    glow: { enabled: BUILTIN.glow.enabled, color: BUILTIN.glow.color },
  };
  switch (control.type) {
    case "button":
      resolved.bindings = [...(control.bindings ?? [])];
      break;
    case "stick": {
      const tuning = { ...BUILTIN.stick, ...defaults.tuning?.stick, ...control.tuning };
      resolved.side = control.side ?? "left";
      resolved.stick = {
        click: control.click ?? (resolved.side === "left" ? "l3" : "r3"),
        tuning: { deadZone: tuning.deadZone, maxZone: tuning.maxZone },
      };
      break;
    }
    case "trigger": {
      const tuning = { ...BUILTIN.trigger, ...defaults.tuning?.trigger, ...control.tuning };
      resolved.trigger = {
        which: control.trigger ?? "l2",
        direction: control.direction ?? "up",
        showFill: BUILTIN.trigger.showFill,
        fill: BUILTIN.trigger.fill,
        maxZone: BUILTIN.trigger.fill,
        tuning: { maxZone: tuning.maxZone, minForce: tuning.minForce },
      };
      break;
    }
    case "touchpad":
      resolved.area = control.area ?? "full";
      break;
    case "system":
      resolved.action = control.action ?? "menu";
      if (resolved.action !== "menu") resolved.toggleActive = BUILTIN.toggleActive;
      break;
  }
  return resolved;
}

/** Turns a validated manifest into the resolved skin renderers use. */
export function resolveSkin(manifest: Manifest, loaded: LoadedControl[]): ResolvedSkin {
  const controls = loaded.map((l) => resolveControl(l, manifest));
  return {
    canvas: { width: CANVAS.width, height: CANVAS.height },
    meta: { name: manifest.name, author: manifest.author, version: manifest.version, format: 1 },
    background: null,
    ...(manifest.preview ? { preview: manifest.preview } : {}),
    controls,
    groups: controls.map((c) => ({ name: c.group, anchor: c.anchor, controls: [c.id] })),
  };
}
