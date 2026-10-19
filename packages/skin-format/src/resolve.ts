import { BUILTIN, CANVAS } from "./constants.ts";
import type { Anchor, Manifest, ManifestControl, ResolvedControl, ResolvedSkin } from "./types.ts";
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
    elements: Object.entries(control.elements ?? {}).map(([id, element]) => ({
      id,
      role: element.role ?? null,
      colors: { inactive: null, active: null },
    })),
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

/** Anchor implied by a horizontal span: left third → left, right third → right, else center. */
function anchorFromPosition(left: number, right: number): Anchor {
  const center = (left + right) / 2;
  if (center < CANVAS.width / 3) return "left";
  if (center > (CANVAS.width * 2) / 3) return "right";
  return "center";
}

function resolveBackground(manifest: Manifest): ResolvedSkin["background"] {
  const bg = manifest.background;
  if (!bg) return null;
  return {
    color: bg.color && bg.color !== "inherit" ? bg.color : BUILTIN.background.color,
    ...(bg.image ? { image: bg.image } : {}),
    placement: bg.placement ?? BUILTIN.background.placement,
    opacity: bg.opacity ?? BUILTIN.background.opacity,
  };
}

/** Turns a validated manifest into the resolved skin renderers use. */
export function resolveSkin(manifest: Manifest, loaded: LoadedControl[]): ResolvedSkin {
  const controls = loaded.map((l) => resolveControl(l, manifest));
  const byId = new Map(controls.map((c) => [c.id, c]));

  // declared groups first, then one implicit group per ungrouped control
  const groups: ResolvedSkin["groups"] = [];
  for (const group of manifest.groups ?? []) {
    const members = group.controls.map((id) => byId.get(id)).filter((c) => c !== undefined);
    const left = Math.min(...members.map((c) => c.box.x));
    const right = Math.max(...members.map((c) => c.box.x + c.box.width));
    const anchor = group.anchor ?? anchorFromPosition(left, right);
    for (const c of members) { c.group = group.name; c.anchor = anchor; }
    groups.push({ name: group.name, anchor, controls: members.map((c) => c.id) });
  }
  const grouped = new Set(groups.flatMap((g) => g.controls));
  for (const c of controls) {
    if (grouped.has(c.id)) continue;
    const declared = manifest.controls.find((m) => m.id === c.id)?.anchor;
    c.group = c.id;
    c.anchor = declared ?? anchorFromPosition(c.box.x, c.box.x + c.box.width);
    groups.push({ name: c.id, anchor: c.anchor, controls: [c.id] });
  }

  return {
    canvas: { width: CANVAS.width, height: CANVAS.height },
    meta: { name: manifest.name, author: manifest.author, version: manifest.version, format: 1 },
    background: resolveBackground(manifest),
    ...(manifest.preview ? { preview: manifest.preview } : {}),
    controls,
    groups,
  };
}
