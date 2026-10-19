import { BUILTIN, CANVAS } from "./constants.ts";
import type { Anchor, ColorPair, Manifest, ManifestControl, ResolvedControl, ResolvedElement, ResolvedSkin, Role } from "./types.ts";
import type { SvgScan } from "./validate/svg.ts";

export interface LoadedControl {
  control: ManifestControl;
  text: string;
  scan: SvgScan;
}

/** A declared color, or undefined when omitted or "inherit". */
const own = (color: string | undefined) => (color && color !== "inherit" ? color : undefined);

/**
 * Element colors: element value → its nearest listed ancestor group (SVG groups share their
 * colors with their contents) → the skin default for the element's role → null (keep the SVG
 * color). Each state (inactive / active) inherits independently.
 */
function resolveElements({ control, scan }: LoadedControl, manifest: Manifest): ResolvedElement[] {
  const listed = control.elements ?? {};
  const roleDefaults = manifest.defaults?.colors ?? {};
  const defaultsFor = (role: Role | null): ColorPair | undefined =>
    role === null ? undefined : role === "thumb-label" ? roleDefaults["thumb-label"] ?? roleDefaults.label : roleDefaults[role];

  return Object.entries(listed).map(([id, element]) => {
    // listed ancestors, nearest first
    const ancestors = [...(scan.ids.get(id)?.insideGroupIds ?? [])].reverse().map((g) => listed[g]).filter((e) => e !== undefined);
    const role = element.role ?? ancestors.find((a) => a.role)?.role ?? null;
    const pick = (state: keyof ColorPair) =>
      own(element.colors?.[state]) ?? ancestors.map((a) => own(a.colors?.[state])).find((c) => c !== undefined) ?? own(defaultsFor(role)?.[state]) ?? null;
    return { id, role, colors: { inactive: pick("inactive"), active: pick("active") } };
  });
}

function resolveControl(loaded: LoadedControl, manifest: Manifest): ResolvedControl {
  const { control, text } = loaded;
  const defaults = manifest.defaults ?? {};
  const resolved: ResolvedControl = {
    id: control.id,
    type: control.type,
    svg: { path: control.svg, text },
    box: { ...control.box },
    anchor: "center",
    group: control.id,
    elements: resolveElements(loaded, manifest),
    glow: {
      enabled: control.glow?.enabled ?? defaults.glow?.enabled ?? BUILTIN.glow.enabled,
      color: own(control.glow?.color) ?? own(defaults.glow?.color) ?? BUILTIN.glow.color,
    },
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
      const fill = own(control.colors?.fill) ?? own(defaults.trigger?.fill) ?? BUILTIN.trigger.fill;
      resolved.trigger = {
        which: control.trigger ?? "l2",
        direction: control.direction ?? "up",
        showFill: control.showFill ?? defaults.trigger?.showFill ?? BUILTIN.trigger.showFill,
        fill,
        // the 100% zone uses the fill color unless it has its own
        maxZone: own(control.colors?.maxZone) ?? own(defaults.trigger?.maxZone) ?? fill,
        tuning: { maxZone: tuning.maxZone, minForce: tuning.minForce },
      };
      break;
    }
    case "touchpad":
      resolved.area = control.area ?? "full";
      break;
    case "system":
      resolved.action = control.action ?? "menu";
      if (resolved.action !== "menu") resolved.toggleActive = control.toggleActive ?? defaults.toggleActive ?? BUILTIN.toggleActive;
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
