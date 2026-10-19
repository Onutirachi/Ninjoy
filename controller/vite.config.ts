import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // reachable from phones on the same network
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] }, // skins/ lives at the repository root
  },
});
