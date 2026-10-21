import "@fontsource-variable/manrope";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "./styles.css";
import { createApp } from "./app.ts";
import { tauriBridge } from "./bridge.ts";

// the window is an app, not a web page: no zooming (ctrl+wheel, touchpad pinch, ctrl +/-/0),
// which would break the layout on laptops
window.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && ["+", "=", "-", "_", "0"].includes(e.key)) e.preventDefault();
});
for (const gesture of ["gesturestart", "gesturechange"]) document.addEventListener(gesture, (e) => e.preventDefault());

const root = document.getElementById("root")!;
void tauriBridge().then((bridge) => createApp(root, bridge, { splash: true }));
