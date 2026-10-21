type Rgb = [number, number, number];

/** Lightbar colors by player number until the game sets one (like a console). */
const PLAYER_COLORS: Rgb[] = [[48, 153, 232], [232, 72, 72], [72, 200, 120], [230, 110, 200]];

let player: Rgb = PLAYER_COLORS[0]!;
let game: Rgb | null = null;

/**
 * How the color looks on a screen: games send LED intensities (a dim `64 0 0` is a clear red on
 * the controller's LED but almost black on a screen), so dim colors are brightened along a curve
 * that keeps the hue and the order of brightness (fades still show). Off (black) stays off.
 */
export function asShown([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  if (max === 0) return [0, 0, 0];
  const brightness = 0.4 + 0.6 * Math.sqrt(max / 255);
  return [r, g, b].map((v) => Math.round((v * 255 * brightness) / max)) as Rgb;
}

const paint = (root: HTMLElement) => {
  const [r, g, b] = game ? asShown(game) : player;
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
