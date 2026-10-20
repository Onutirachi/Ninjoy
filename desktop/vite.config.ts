import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Tauri loads the built files from disk
  base: "./",
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [here("..")] }, // assets/ and skins/ live at the repository root
  },
  build: { target: "es2022" },
});
