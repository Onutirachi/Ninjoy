# Quickstart: validating the controller touch engine

## Prerequisites

- Node.js 26; repository root: `npm install`
- Chromium for browser tests: `npx playwright install chromium`

## 1. Automated tests

```bash
npm test --workspace @ninjoy/controller
```

| Group | Proves |
|---|---|
| unit: zones, stick, trigger, touchpad, layout, motion frame, settings | the arithmetic of FR-004/005/011/014/015/021 and data-model.md |
| unit: fingers | stick ownership, newest-wins, last-entered trigger, double-tap timings (FR-010/013/014) |
| browser: buttons | press, slide, multi-press, exact edges, two fingers (US1) |
| browser: sticks | outside steering, thumb rest/follow/return, ellipse clamp, click (US2) |
| browser: triggers | force values, last finger, fill visibility and opacity (US3) |
| browser: touchpad, system, motion | half mapping, 2-touch limit, click buttons, act-on-release, gyro on/off (US4) |
| browser: layout | 100% = drawing (SC-004), anchors at 16:9/4:3, auto size, height, edits persist and scale (US5, SC-005) |
| browser: menu | settings apply and persist, per-control overrides, language (US6) |
| browser: appearance | active colors, label-on/off, glow, toggles, vibration stub (US7) |
| browser: no stuck controls | 200 randomized seeded touch sequences end with an empty state (SC-003) |
| browser: performance | < 2 ms per pointer event with CPU ×4 throttling (SC-002) |

## 2. Try it by hand

```bash
npm run dev --workspace @ninjoy/controller
```

Open the printed URL with `?dev` to see the live state. In the browser's device toolbar pick a
phone in landscape (20:9) and a tablet (4:3). On a real phone on the same network, use the
"Network" URL Vite prints (motion sensing requires HTTPS, which arrives with the host feature).
