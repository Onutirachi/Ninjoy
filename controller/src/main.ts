import { createController } from "./dom/controller.ts";
import { gameVibrates } from "./engine/settings.ts";
import { createI18n, detectLanguage, type I18n } from "./i18n/index.ts";
import { deviceId } from "./platform/device-id.ts";
import { keepAwake } from "./platform/wake-lock.ts";
import { createRumble } from "./platform/rumble.ts";
import { createSession, sessionUrl, slotFromPath, type SessionStatus } from "./platform/session.ts";
import type { ResolvedSkin } from "@ninjoy/skin-format";
import { chosenSkin, fetchSkinIndex, loadOfficialSkin, loadSkinFromHost, pickSkin, saveChosenSkin, type SkinIndex } from "./skins.ts";
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

/**
 * The skin to start with: the phone's choice from the host's library, or the host's default;
 * the bundled official skin when the library cannot be reached (an old host, the dev server).
 */
async function firstSkin(): Promise<{ skin: ResolvedSkin; id: string; index: SkinIndex | null; missing: boolean }> {
  try {
    const index = await fetchSkinIndex();
    const pick = pickSkin(index, chosenSkin());
    const entry = index.skins.find((s) => s.id === pick.id)!;
    return { skin: await loadSkinFromHost(entry), id: pick.id, index, missing: pick.missing };
  } catch {
    return { skin: await loadOfficialSkin(), id: "ninjoy", index: null, missing: false };
  }
}

try {
  const start = await firstSkin();
  let skinIndex = start.index;
  let skinId = start.id;
  let i18n: I18n = createI18n("en");
  const notices = createNotices(() => i18n);
  const showDev = new URLSearchParams(location.search).has("dev");

  /** Everything tied to one skin: the controller, its menu, edit toolbar and dev panel. */
  const mount = (skin: ResolvedSkin, id: string) => {
    const controller = createController({
      skin,
      skinId: id,
      root: app,
      onMenu: () => current.menu.show(),
      onNotice: (key) => notices.show(key),
    });
    const menu = createMenu({
      controller,
      skin,
      i18n: () => i18n,
      onLanguage: () => setLanguage(),
      onVibration: (v) => {
        if (!gameVibrates(v)) {
          rumble.stop();
          current.controller.setGameRumble(false);
        }
      },
      onEditLayout: () => current.controller.setEditMode(true),
      slot: () => session.slot,
      skins: () => (skinIndex ? { index: skinIndex, current: skinId, chosen: chosenSkin(), previewUrl: (sid, path) => `/skins/${sid}/${path}` } : null),
      onSkin: (choice) => {
        saveChosenSkin(choice);
        void switchSkin();
      },
    });
    const toolbar = createEditToolbar({ controller, skin, i18n: () => i18n });
    const devPanel = showDev ? attachDevPanel(controller) : null;
    const unsubscribe = controller.subscribe((state) => session.send(state));
    return { controller, menu, toolbar, devPanel, unsubscribe };
  };
  let current = mount(start.skin, start.id);
  const setLanguage = () => {
    i18n = createI18n(detectLanguage(current.controller.settings.language, navigator.languages));
    document.documentElement.lang = i18n.locale;
  };
  setLanguage();
  if (start.missing) notices.show("skinMissing");

  /**
   * Shows the skin this phone should use now (after a choice or a library change), without
   * reconnecting: the old controller releases everything, the new one sends its state.
   */
  let switching = Promise.resolve();
  const switchSkin = () =>
    (switching = switching.then(async () => {
      try {
        skinIndex = await fetchSkinIndex();
      } catch {
        return; // the host cannot be reached: keep the skin in use
      }
      const pick = pickSkin(skinIndex, chosenSkin());
      if (pick.missing) notices.show("skinMissing");
      session.setSkin(chosenSkin() && !pick.missing ? pick.id : "");
      if (pick.id === skinId) return;
      let skin: ResolvedSkin;
      try {
        skin = await loadSkinFromHost(skinIndex.skins.find((s) => s.id === pick.id)!);
      } catch {
        notices.show("skinMissing");
        return;
      }
      const wasOpen = current.menu.open;
      current.controller.releaseAll();
      current.unsubscribe();
      current.menu.dispose();
      current.toolbar.dispose();
      current.devPanel?.dispose();
      current.controller.dispose();
      skinId = pick.id;
      current = mount(skin, pick.id);
      if (started) current.controller.requestMotion();
      session.send(current.controller.state);
      if (wasOpen) current.menu.show();
    }));

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
    current.devPanel?.setConnection(s.kind === "joined" ? `controller ${s.slot}` : s.kind);
    switch (s.kind) {
      case "list":
        break; // the list appears when it arrives (onList)
      case "connecting":
        screens.show({ message: t("session.connecting"), pulse: true });
        break;
      case "unavailable":
        current.controller.releaseAll();
        screens.show({ message: t("session.unavailable"), pulse: true });
        break;
      case "joined": {
        setPlayerColor(s.slot);
        // a reload keeps the same controller
        history.replaceState(null, "", `/${s.slot}${location.search}`);
        session.send(current.controller.state);
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
              current.controller.requestMotion();
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
    onRtt: (ms) => current.devPanel?.setRtt(ms),
    onSkinsChanged: () => void switchSkin(),
    onFeedback: (f) => {
      if (f.rumble) {
        const [strong, weak] = gameVibrates(current.controller.settings.vibration) ? f.rumble : [0, 0];
        rumble.set(strong, weak);
        current.controller.setGameRumble(strong > 0 || weak > 0);
      }
      if (f.lightbar) {
        applyLightbar(f.lightbar);
        current.devPanel?.setLightbar(f.lightbar);
      }
    },
  });
  session.setSkin(chosenSkin() && !start.missing ? skinId : "");
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
