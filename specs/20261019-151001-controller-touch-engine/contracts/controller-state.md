# Contract: controller state and engine API

The controller page exposes the engine to the rest of the page (menu, development panel) and,
later, to the protocol feature that sends the state to the host.

## Controller state

```ts
type DS4Button =
  | "cross" | "circle" | "square" | "triangle"
  | "up" | "down" | "left" | "right"
  | "l1" | "r1" | "l2" | "r2" | "l3" | "r3"
  | "share" | "options" | "ps" | "touchpad";

interface Vec3 { x: number; y: number; z: number }

interface ControllerState {
  /** increments on every change */
  seq: number;
  /** performance.now() of the change */
  time: number;
  buttons: ReadonlySet<DS4Button>;
  /** −1…1; y positive = down */
  sticks: { left: { x: number; y: number }; right: { x: number; y: number } };
  /** 0…1 */
  triggers: { l2: number; r2: number };
  /** up to 2 most recent touches, normalized over the whole DS4 touchpad */
  touchpad: { touches: { id: number; x: number; y: number }[] };
  gyro: boolean;
  /** controller frame: x right, y up, z toward the player; null when gyro off or no sensor */
  motion: { rate: Vec3; accel: Vec3; time: number } | null;
}
```

Guarantees:
- A new state object is published synchronously while handling the event that changed it.
- When no finger is down, `buttons` contains only toggle-independent nothing (empty), sticks
  are 0, triggers 0, no touches.
- Consumers must treat the object as read-only.

## Engine API (`controller/src/dom/controller.ts`)

```ts
interface ControllerOptions {
  skin: ResolvedSkin;                 // from @ninjoy/skin-format
  root: HTMLElement;                  // element the controller fills
  storage?: Storage;                  // defaults to localStorage; tests pass a stub
  platform?: Partial<Platform>;       // vibration/fullscreen/motion adapters (tests stub them)
}

interface Controller {
  readonly state: ControllerState;
  subscribe(listener: (state: ControllerState) => void): () => void;
  readonly settings: PlayerSettings;
  updateSettings(patch: Partial<PlayerSettings>): void;
  setEditMode(on: boolean): void;
  resetLayout(): void;
  releaseAll(): void;
  /** re-measure after resize/orientation change (also automatic) */
  relayout(): void;
  dispose(): void;
}

function createController(options: ControllerOptions): Controller;
```

The player menu, the edit mode and the development panel use only this API.

## Pure engine functions (`controller/src/engine/`)

Exported for unit tests and reused by the DOM layer; signatures are indicative.

```ts
applyZones(raw: number, dead: number, max: number): number;          // stick magnitude
stickValue(offset: {x,y}, travel: {x,y}, zones): { x, y, clamped: {x,y} };
triggerForce(raw: number, maxZone: number, minForce: number): number;
touchpadPoint(local: {x,y}, area: "full" | "left" | "right"): {x,y};
groupTransform(input: LayoutInput): Matrix;                           // data-model.md formula
autoSize(screenHeightPx: number): number;                             // clamp(430 / h, 0.4, 1)
toControllerFrame(rate: Vec3, accel: Vec3, orientationAngle: number): { rate, accel };
```
