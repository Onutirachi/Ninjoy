import { createController } from "./dom/controller.ts";
import { loadOfficialSkin } from "./skins.ts";
import { attachDevPanel } from "./ui/dev-panel.ts";
import "./ui/styles.css";

const app = document.getElementById("app")!;

try {
  const controller = createController({ skin: await loadOfficialSkin(), root: app });
  if (new URLSearchParams(location.search).has("dev")) attachDevPanel(controller);
} catch (error) {
  app.innerHTML = "";
  const message = document.createElement("pre");
  message.className = "nj-error";
  message.textContent = String(error instanceof Error ? error.message : error);
  app.append(message);
}
