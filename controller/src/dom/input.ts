export interface Finger {
  id: number;
  x: number;
  y: number;
  pointerType: string;
  downAt: number;
}

export interface InputHandlers {
  down(finger: Finger): void;
  move(finger: Finger): void;
  /** `completed` is false when the browser cancelled the touch */
  up(finger: Finger, completed: boolean): void;
}

/**
 * Pointer input on the stage. Every finger that went down is released exactly once: on up,
 * cancel, lost capture, the window losing focus, the page being hidden or releaseAll().
 */
export function attachInput(stage: HTMLElement, handlers: InputHandlers, now: () => number = () => performance.now()) {
  const fingers = new Map<number, Finger>();
  let enabled = true;

  const release = (id: number, completed: boolean) => {
    const finger = fingers.get(id);
    if (!finger) return;
    fingers.delete(id);
    handlers.up(finger, completed);
  };
  const releaseAll = () => {
    for (const id of [...fingers.keys()]) release(id, false);
  };

  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!enabled) return;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone (or synthetic)
    }
    const finger = { id: e.pointerId, x: e.clientX, y: e.clientY, pointerType: e.pointerType, downAt: now() };
    fingers.set(e.pointerId, finger);
    handlers.down(finger);
  };
  const onMove = (e: PointerEvent) => {
    const finger = fingers.get(e.pointerId);
    if (!finger) return;
    finger.x = e.clientX;
    finger.y = e.clientY;
    handlers.move(finger);
  };
  const onUp = (e: PointerEvent) => {
    const finger = fingers.get(e.pointerId);
    if (finger) {
      finger.x = e.clientX;
      finger.y = e.clientY;
    }
    release(e.pointerId, true);
  };
  const onCancel = (e: PointerEvent) => release(e.pointerId, false);
  const onHidden = () => {
    if (document.visibilityState === "hidden") releaseAll();
  };
  const prevent = (e: Event) => e.preventDefault();

  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onCancel);
  stage.addEventListener("lostpointercapture", onCancel);
  stage.addEventListener("contextmenu", prevent);
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", onHidden);

  return {
    fingers: fingers as ReadonlyMap<number, Finger>,
    releaseAll,
    /** while disabled (menu open, edit mode) new touches are ignored */
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) releaseAll();
    },
    dispose() {
      releaseAll();
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onCancel);
      stage.removeEventListener("lostpointercapture", onCancel);
      stage.removeEventListener("contextmenu", prevent);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onHidden);
    },
  };
}
