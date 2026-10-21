/** Small DOM helpers and the app's line icons. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

/** An element from trusted markup (our own SVG icons and brand art). */
export function html(markup: string): Element {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstElementChild!;
}

const icon = (paths: string) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

export const icons = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  wifi: icon('<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r="1"/>'),
  gear: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  gamepad: icon('<rect x="3" y="7" width="18" height="11" rx="5"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".8"/><circle cx="17.5" cy="13.5" r=".8"/>'),
  leave: icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  trash: icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  minimize: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8"/></svg>',
  maximize: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2.5"/></svg>',
  close: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg>',
};

/** An address as people read and type it (the QR code keeps the full one). */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** Default lightbar colors by player number until the game sets one (like a console). */
const PLAYER_COLORS: [number, number, number][] = [[48, 153, 232], [232, 72, 72], [72, 200, 120], [230, 110, 200]];

/**
 * The lightbar as the phone shows it: games send LED intensities (a dim `64 0 0` is a clear red on
 * an LED but almost black on a screen), so dim colors are brightened along a curve that keeps the
 * hue and the order of brightness (fades still show). Same curve as the controller page.
 */
export function lightbarCss(color: [number, number, number] | null, number: number): string {
  if (!color) {
    const [r, g, b] = PLAYER_COLORS[(number - 1) % PLAYER_COLORS.length]!;
    return `rgb(${r} ${g} ${b})`;
  }
  const max = Math.max(...color);
  const brightness = 0.4 + 0.6 * Math.sqrt(max / 255);
  const [r, g, b] = max === 0 ? color : color.map((v) => Math.round((v * 255 * brightness) / max));
  return `rgb(${r} ${g} ${b})`;
}
