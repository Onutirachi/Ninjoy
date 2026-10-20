/**
 * Exposes the game's lightbar color to the page as `--ninjoy-lightbar` (skins may use it later).
 */
export function applyLightbar(rgb: [number, number, number] | null, root: HTMLElement = document.documentElement) {
  if (rgb) root.style.setProperty("--ninjoy-lightbar", `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`);
  else root.style.removeProperty("--ninjoy-lightbar");
}
