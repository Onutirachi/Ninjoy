import { createController } from "./dom/controller.ts";
import { createI18n, detectLanguage, type I18n } from "./i18n/index.ts";
import { loadOfficialSkin } from "./skins.ts";
import { attachDevPanel } from "./ui/dev-panel.ts";
import { createEditToolbar } from "./ui/edit-mode.ts";
import { createMenu } from "./ui/menu.ts";
import { createNotices } from "./ui/notices.ts";
import "./ui/styles.css";

const app = document.getElementById("app")!;

try {
  const skin = await loadOfficialSkin();
  let i18n: I18n = createI18n("en");
  const notices = createNotices(() => i18n);
  const controller = createController({
    skin,
    root: app,
    onMenu: () => menu.show(),
    onNotice: (key) => notices.show(key),
  });
  const setLanguage = () => {
    i18n = createI18n(detectLanguage(controller.settings.language, navigator.languages));
    document.documentElement.lang = i18n.locale;
  };
  setLanguage();
  const menu = createMenu({
    controller,
    skin,
    i18n: () => i18n,
    onLanguage: setLanguage,
    onEditLayout: () => controller.setEditMode(true),
  });
  createEditToolbar({ controller, skin, i18n: () => i18n });
  if (new URLSearchParams(location.search).has("dev")) attachDevPanel(controller);
} catch (error) {
  app.innerHTML = "";
  const message = document.createElement("pre");
  message.className = "nj-error";
  message.textContent = String(error instanceof Error ? error.message : error);
  app.append(message);
}
