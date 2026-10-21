type Rgb = [number, number, number];

/** Lightbar colors by player number until the game sets one (like a console). */
const PLAYER_COLORS: Rgb[] = [[48, 153, 232], [232, 72, 72], [72, 200, 120], [230, 110, 200]];

let player: Rgb = PLAYER_COLORS[0]!;
let game: Rgb | null = null;

const paint = (root: HTMLElement) => {
  const [r, g, b] = game ?? player;
  root.style.setProperty("--ninjoy-lightbar", `rgb(${r} ${g} ${b})`);
};

/** The controller number's color, used while the game sets none. */
export function setPlayerColor(slot: number, root: HTMLElement = document.documentElement) {
  player = PLAYER_COLORS[(Math.max(1, slot) - 1) % PLAYER_COLORS.length]!;
  paint(root);
}

/**
 * Exposes the lightbar color to the page as `--ninjoy-lightbar` (skins paint elements with it):
 * the game's color, or the player's when the game sets none (`null`).
 */
export function applyLightbar(rgb: Rgb | null, root: HTMLElement = document.documentElement) {
  game = rgb;
  paint(root);
}
