import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  server: {
    host: true, // reachable from phones on the same network
    fs: { allow: [here("..")] }, // skins/ and assets/ live at the repository root
  },
  build: {
    rollupOptions: {
      // the controller, and the page the host shows on its plain (non-secure) address
      input: { main: here("index.html"), explain: here("explain.html") },
    },
  },
});
