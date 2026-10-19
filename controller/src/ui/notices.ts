import type { NoticeKey } from "../dom/controller.ts";
import type { I18n } from "../i18n/index.ts";

const SHOW_MS = 5000;

/** Explains unsupported device features, once per page load each. */
export function createNotices(i18n: I18n, parent: HTMLElement = document.body) {
  const shown = new Set<NoticeKey>();
  const el = document.createElement("div");
  el.className = "nj-notice";
  el.setAttribute("role", "status");
  el.hidden = true;
  parent.append(el);
  let timer = 0;

  return {
    show(key: NoticeKey) {
      if (shown.has(key)) return;
      shown.add(key);
      el.textContent = i18n.t(`notice.${key}`);
      el.hidden = false;
      clearTimeout(timer);
      timer = window.setTimeout(() => (el.hidden = true), SHOW_MS);
    },
    dispose() {
      clearTimeout(timer);
      el.remove();
    },
  };
}
