import "@fontsource-variable/manrope";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "./styles.css";
import { createApp } from "./app.ts";
import { tauriBridge } from "./bridge.ts";

const root = document.getElementById("root")!;
void tauriBridge().then((bridge) => createApp(root, bridge, { splash: true }));
