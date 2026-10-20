import { createController } from "./dom/controller.ts";
import { createI18n, detectLanguage, type I18n } from "./i18n/index.ts";
import { deviceId } from "./platform/device-id.ts";
import { createSession, sessionUrl, slotFromPath, type SessionStatus } from "./platform/session.ts";
import { loadOfficialSkin } from "./skins.ts";
import { attachDevPanel } from "./ui/dev-panel.ts";
import { createEditToolbar } from "./ui/edit-mode.ts";
import { renderLobby } from "./ui/lobby.ts";
import { createMenu } from "./ui/menu.ts";
import { createNotices } from "./ui/notices.ts";
import { createScreens } from "./ui/screens.ts";
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
    subtitle: () => (session.slot ? i18n.t("menu.controller", { n: session.slot }) : null),
  });
  createEditToolbar({ controller, skin, i18n: () => i18n });
  const devPanel = new URLSearchParams(location.search).has("dev") ? attachDevPanel(controller) : null;

  // ---------- session with the host ----------
  const screens = createScreens();
  const showStatus = (s: SessionStatus) => {
    const { t } = i18n;
    devPanel?.setConnection(s.kind === "joined" ? `controller ${s.slot}` : s.kind);
    switch (s.kind) {
      case "list":
        break; // the list appears when it arrives (onList)
      case "connecting":
        screens.show({ message: t("session.connecting"), pulse: true });
        break;
      case "unavailable":
        controller.releaseAll();
        screens.show({ message: t("session.unavailable"), pulse: true });
        break;
      case "joined":
        screens.hide();
        // a reload keeps the same controller
        history.replaceState(null, "", `/${s.slot}${location.search}`);
        screens.toast(t("session.joined", { n: s.slot }));
        session.send(controller.state);
        break;
      case "in-use":
        screens.show({
          message: s.slot ? t("session.inUse", { n: s.slot }) : t("session.notAllowed"),
          buttons: [{ label: t("action.seeControllers"), onClick: () => session.list(), primary: true }],
        });
        break;
      case "opened-elsewhere":
        screens.show({
          message: t("session.openedElsewhere"),
          buttons: [{ label: t("action.useHere"), onClick: () => session.join(s.slot), primary: true }],
        });
        break;
      case "kicked":
        screens.show({
          message: t("session.kicked"),
          buttons: [{ label: t("action.joinAgain"), onClick: () => session.list(), primary: true }],
        });
        break;
      case "update-needed":
        screens.show({ message: t("session.updateNeeded") });
        break;
    }
  };
  const session = createSession({
    url: sessionUrl(),
    device: deviceId(),
    onStatus: showStatus,
    onList: (entries, phonesCanCreate) => {
      if (session.status.kind !== "list") return;
      screens.show({ body: renderLobby({ i18n, entries, phonesCanCreate, onPick: (slot) => session.join(slot) }) });
    },
    onRtt: (ms) => devPanel?.setRtt(ms),
    onFeedback: (f) => devPanel?.setLightbar(f.lightbar),
  });
  controller.subscribe((state) => session.send(state));
  const requested = slotFromPath(location.pathname);
  if (requested) session.join(requested);
  else session.list();
} catch (error) {
  app.innerHTML = "";
  const message = document.createElement("pre");
  message.className = "nj-error";
  message.textContent = String(error instanceof Error ? error.message : error);
  app.append(message);
}
