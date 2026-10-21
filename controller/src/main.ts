import { createController } from "./dom/controller.ts";
import { gameVibrates } from "./engine/settings.ts";
import { createI18n, detectLanguage, type I18n } from "./i18n/index.ts";
import { deviceId } from "./platform/device-id.ts";
import { keepAwake } from "./platform/wake-lock.ts";
import { createRumble } from "./platform/rumble.ts";
import { createSession, sessionUrl, slotFromPath, type SessionStatus } from "./platform/session.ts";
import { loadOfficialSkin } from "./skins.ts";
import { attachDevPanel } from "./ui/dev-panel.ts";
import { createEditToolbar } from "./ui/edit-mode.ts";
import { applyLightbar, setPlayerColor } from "./ui/lightbar.ts";
import { renderLobby } from "./ui/lobby.ts";
import { renderStart } from "./ui/start.ts";
import { createMenu } from "./ui/menu.ts";
import { createNotices } from "./ui/notices.ts";
import { createScreens, playSplash, watchOrientation } from "./ui/screens.ts";
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
    onVibration: (v) => {
      if (!gameVibrates(v)) {
        rumble.stop();
        controller.setGameRumble(false);
      }
    },
    onEditLayout: () => controller.setEditMode(true),
    slot: () => session.slot,
  });
  createEditToolbar({ controller, skin, i18n: () => i18n });
  const devPanel = new URLSearchParams(location.search).has("dev") ? attachDevPanel(controller) : null;

  // ---------- session with the host ----------
  void playSplash();
  const screens = createScreens();
  const orientation = watchOrientation(() => i18n.t("notice.turnSideways"));
  /** set by the "tap to play" tap; reconnections do not ask again */
  let started = false;
  const rumble = createRumble({ onUnsupported: () => notices.show("noVibration") });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") rumble.stop();
  });
  const showStatus = (s: SessionStatus) => {
    const { t } = i18n;
    if (s.kind !== "joined") {
      rumble.stop();
      orientation.setActive(false);
    }
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
      case "joined": {
        // the host sends the game's color right after, if the game set one
        applyLightbar(null);
        setPlayerColor(s.slot);
        // a reload keeps the same controller
        history.replaceState(null, "", `/${s.slot}${location.search}`);
        session.send(controller.state);
        const play = () => {
          screens.hide();
          orientation.setActive(true);
          screens.toast(t("session.joined", { n: s.slot }));
        };
        if (started) {
          play();
          break;
        }
        screens.show({
          body: renderStart({
            i18n,
            slot: s.slot,
            onStart: () => {
              // this tap is the user activation browsers require for these
              started = true;
              keepAwake();
              controller.requestMotion();
              play();
            },
          }),
        });
        break;
      }
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
      screens.show({ variant: "still", body: renderLobby({ i18n, entries, phonesCanCreate, onPick: (slot) => session.join(slot) }) });
    },
    onRtt: (ms) => devPanel?.setRtt(ms),
    onFeedback: (f) => {
      if (f.rumble) {
        const [strong, weak] = gameVibrates(controller.settings.vibration) ? f.rumble : [0, 0];
        rumble.set(strong, weak);
        controller.setGameRumble(strong > 0 || weak > 0);
      }
      if (f.lightbar) {
        applyLightbar(f.lightbar);
        devPanel?.setLightbar(f.lightbar);
      }
    },
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
