export interface FullscreenAdapter {
  supported(): boolean;
  active(): boolean;
  toggle(element: HTMLElement): void;
  onChange(listener: () => void): () => void;
}

export const browserFullscreen: FullscreenAdapter = {
  // iPhone Safari has no fullscreen API for pages: the home-screen app is the way there
  supported: () => document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function",
  active: () => document.fullscreenElement !== null,
  toggle(element) {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void element.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  },
  onChange(listener) {
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  },
};
