import { createController } from "./dom/controller.ts";
import { DEFAULT_SETTINGS } from "./engine/settings.ts";
import { createI18n, detectLanguage } from "./i18n/index.ts";
import { loadOfficialSkin } from "./skins.ts";
import { attachDevPanel } from "./ui/dev-panel.ts";
import { createNotices } from "./ui/notices.ts";
import "./ui/styles.css";

const app = document.getElementById("app")!;

try {
  // the menu (with the language setting) replaces this in US6
  const notices = createNotices(createI18n(detectLanguage(DEFAULT_SETTINGS.language, navigator.languages)));
  const controller = createController({ skin: await loadOfficialSkin(), root: app, onNotice: (key) => notices.show(key) });
  if (new URLSearchParams(location.search).has("dev")) attachDevPanel(controller);
} catch (error) {
  app.innerHTML = "";
  const message = document.createElement("pre");
  message.className = "nj-error";
  message.textContent = String(error instanceof Error ? error.message : error);
  app.append(message);
}
