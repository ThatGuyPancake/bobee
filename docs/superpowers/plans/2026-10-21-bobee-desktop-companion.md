# Bobee Desktop Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop companion: a pixel-art bear named Bobee that wanders, naps, shows sweet messages and reacts to typing, shipped as `Bobee Setup.exe`.

**Architecture:** Electron. The main process owns the transparent pet window, tray, keyboard hook, idle polling and autostart. It serves the app over a privileged `bobee://` protocol, so canvas pixel reads and `fetch` work. The renderer is plain ES modules. All timing and decisions live in a pure `brain.js` state machine (unit-tested with a simulated clock). `sprite.js` draws strips and `bubble.js` draws messages.

**Tech Stack:** Electron (latest stable), uiohook-napi, electron-builder (NSIS), vitest, pngjs (dev only, for generating placeholder art).

**Spec:** `docs/superpowers/specs/2026-10-21-bobee-desktop-companion-design.md`

## Global Constraints

- Windows 10/11 only. No networking anywhere in v1.
- Sprite frames are 64×64 px, strips are horizontal, art faces right, drawn at 3× with `imageSmoothingEnabled = false`, 8 fps default.
- Animation names exactly: `idle`, `walk`, `sleep`, `drag`, `happy`.
- Keyboard hook forwards only a pulse. Key codes are never read, stored or sent.
- `contextIsolation: true`, `nodeIntegration: false`.
- Pet window 200×200, transparent, frameless, `alwaysOnTop` at `screen-saver` level, `skipTaskbar`, not resizable, `focusable: false`.
- Custom art in `assets/bobee/` overrides `assets/placeholder/`.

## Review Focus

1. **Stale idle after waking:** a key press wakes Bobee while the last idle poll (up to 10 s old) still says ≥120 s. Bobee must stay awake, not fall back asleep on the next tick. Tested in Task 3.
2. **Narrow or changed work area:** `minX === maxX`, or the display shrinks mid-walk. Walking must never produce `NaN` or leave the bounds. Tested in Task 3.
3. **Input during drag:** key presses and click logic during a drag must not switch state. Release always lands in `idle`. Tested in Task 3.
4. **Tiny message lists:** one message (the "no repeat" rule must not loop forever), or empty lists (fall back to defaults). Tested in Task 1.
5. **Bad art files:** width not a multiple of 64, or a missing file. This must give one frame or the placeholder, never a crash. Tested in Task 2.

## File map

| File | Responsibility |
|---|---|
| `package.json` | scripts, deps, electron-builder config |
| `main.js` | protocol, window, IPC, idle poll, key hook, display changes, tray, autostart |
| `lib/presence.js` | `presenceFrom(idleSeconds)` (CommonJS) |
| `preload.js` | `window.bobee` bridge |
| `renderer/index.html`, `renderer/style.css` | page shell |
| `renderer/messages.js` | parse messages, no-repeat picker |
| `renderer/sprite.js` | strip math + `SpritePlayer` |
| `renderer/brain.js` | state machine |
| `renderer/bubble.js` | speech bubble DOM |
| `renderer/app.js` | wires everything together |
| `scripts/make-placeholders.js` | generates `assets/placeholder/*.png` and `build/icon.png` |
| `messages.json` | the giver's messages |
| `test/*.test.js` | vitest suites |

---

### Task 1: Scaffold + message picker

**Files:**
- Create: `package.json`, `.gitignore`, `messages.json`, `renderer/messages.js`
- Test: `test/messages.test.js`

**Interfaces:**
- Produces: `DEFAULT_MESSAGES: { random: string[], click: string[] }`; `parseMessages(text: string | null): { random: string[], click: string[] }`; `createPicker(messages, random = Math.random): { nextRandom(): string, nextClick(): string }`.

- [ ] **Step 1: Init.** Run `git init`, then `npm init -y`. Set `"name": "bobee"`, `"productName": "Bobee"`, `"main": "main.js"`, and scripts `"start": "electron ."`, `"test": "vitest run"`, `"placeholders": "node scripts/make-placeholders.js"`, `"dist": "electron-builder --win"`. Then run `npm i -D electron@latest electron-builder vitest pngjs` and `npm i uiohook-napi`. `.gitignore`: `node_modules/`, `dist/`.
- [ ] **Step 2: Write `messages.json`** with `{ "random": [...5 sweet lines...], "click": [...3 lines...] }`. Example lines: "drink some water 💧", "I'm proud of you", "you're doing great ✨".
- [ ] **Step 3: Write failing tests** in `test/messages.test.js`:
  - `parseMessages(null)` deep-equals `DEFAULT_MESSAGES`; `parseMessages("{bad")` deep-equals `DEFAULT_MESSAGES`.
  - `parseMessages('{"random":[],"click":[]}').random` equals `DEFAULT_MESSAGES.random`, so empty lists fall back.
  - `parseMessages('{"random":["a"]}').click` equals `["a"]`, so a missing `click` falls back to `random`.
  - A picker over `random: ["a","b","c"]` never returns the same value twice in a row over 200 calls with `Math.random`.
  - A picker over `random: ["only"]` returns `"only"` three times. This must terminate.
- [ ] **Step 4:** Run `npx vitest run test/messages.test.js`. Expected: FAIL (module missing).
- [ ] **Step 5: Implement `renderer/messages.js`** (ES module). The picker excludes the last value when the list has more than one item. Log `console.warn` on parse failure.
- [ ] **Step 6:** Run `npx vitest run test/messages.test.js`. Expected: PASS.
- [ ] **Step 7: Commit** `feat: scaffold project and message picker`.

### Task 2: Sprite math + placeholder art

**Files:**
- Create: `renderer/sprite.js`, `scripts/make-placeholders.js`, `assets/placeholder/{idle,walk,sleep,drag,happy}.png`, `build/icon.png`, `assets/bobee/.gitkeep`
- Test: `test/sprite.test.js`

**Interfaces:**
- Produces (pure, exported): `FRAME = 64`; `stripInfo(width: number): { count: number, frameWidth: number }`; `frameIndex(elapsedMs: number, fps: number, count: number): number`.
- Produces (class, exported): `new SpritePlayer(canvas, { scale = 3, baseUrl = '/assets' })`, with these members:
  - `async load(fpsOverrides?: Record<string, number>)`: tries `bobee/<name>.png` first, then `placeholder/<name>.png`.
  - `play(name: string)`
  - `setFacing('left'|'right')`
  - `draw(nowMs: number)`
  - `isOpaqueAt(canvasX: number, canvasY: number): boolean`
  - `playOverride(img: HTMLImageElement, { durationMs }): void`
  - `durationOf(name: string, loops = 1): number` (ms)

- [ ] **Step 1: Write failing tests:**
  - `stripInfo(256)` → `{count:4, frameWidth:64}`
  - `stripInfo(64)` → `{count:1, frameWidth:64}`
  - `stripInfo(100)` → `{count:1, frameWidth:100}`
  - `stripInfo(0)` → `{count:1, frameWidth:64}`
  - `frameIndex(0,8,4)=0`, `frameIndex(125,8,4)=1`, `frameIndex(500,8,4)=0` (wraps), `frameIndex(999,8,1)=0`.
- [ ] **Step 2:** Run `npx vitest run test/sprite.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the pure functions and `SpritePlayer`** in `renderer/sprite.js`. Draw the current frame, mirrored with `ctx.scale(-1,1)` when facing left, bottom-aligned on the canvas. `isOpaqueAt` reads alpha > 0 from `getImageData` on the canvas. The override replaces the current strip until `durationMs` passes.
- [ ] **Step 4:** Run `npx vitest run test/sprite.test.js`. Expected: PASS.
- [ ] **Step 5: Write `scripts/make-placeholders.js`** using pngjs. It draws a chibi brown bear (round head, ears, muzzle, dot eyes, pink blush) into 64×64 frames. Frames per animation: `idle` 2 (second frame has the body 1 px lower), `walk` 4 (alternating feet), `sleep` 2 (closed eyes, body 1 px lower), `drag` 1 (open-mouth face, feet dangling), `happy` 2 (arms up, frame 2 raised 3 px). Feet sit 4 px above the bottom edge. Also write `build/icon.png` (idle frame 1 scaled 4× to 256×256, nearest neighbour).
- [ ] **Step 6:** Run `npm run placeholders`. Expected: 5 PNGs plus `build/icon.png` exist, and `idle.png` is 128×64.
- [ ] **Step 7: Commit** `feat: sprite strip math, player and placeholder bear`.

### Task 3: Behavior brain

**Files:**
- Create: `renderer/brain.js`
- Test: `test/brain.test.js`

**Interfaces:**
- Produces: `createBrain({ random = Math.random, minX, maxX, x, happyMs = 750 })` returns an object with:
  - `tick(dtMs): { state, animation, facing, dx, bubble }`. `state` is one of `'idle'|'walk'|'sleep'|'drag'|'happy'|'typing'`. `bubble` is one of `null|'click'|'random'|'onfire'`, and each is emitted once.
  - `keyPulse()`
  - `pointerDown(screenX, screenY)`
  - `pointerMove(screenX, screenY): boolean` (true while dragging)
  - `pointerUp(): 'click'|'drag'|null`
  - `setSystemIdle(seconds)`
  - `setPaused(bool)`
  - `setBounds(minX, maxX)`
  - `setX(x)`
- Time is internal: the clock only advances through `tick(dtMs)`. Tests pass a seeded `random`.

Constants (from the spec): idle 3000–8000 ms, then walk with probability 0.7. Walk speed 40 px/s. Sleep when system idle ≥ 120 s. Drag threshold 4 px. Typing ends 3000 ms after the last pulse. Typing happy lasts 1000 ms every 30 pulses. On-fire at a streak of ≥ 300 pulses with a 30 min cooldown. Random bubble every 20–40 min while awake and not paused.

- [ ] **Step 1: Write failing tests** (helper `run(brain, ms, step=100)` collects outputs):
  - `starts idle and walks after ≤ 8 s`: with `random=()=>0.1`, a `walk` state appears within 8000 ms.
  - `walk dx never exceeds 40px/s and stays in bounds`: the sum of dx applied to x stays within [minX, maxX] over 60 s. Each tick satisfies `|dx| ≤ 40*dt/1000`.
  - `facing matches walk direction`: the sign of dx is > 0 when facing `'right'`.
  - `zero-width bounds`: `minX=maxX=500` gives no NaN dx over 30 s.
  - `setBounds shrinking mid-walk clamps target`: x stays within the new bounds.
  - `sleeps when system idle ≥ 120`: `setSystemIdle(120)` gives state `sleep` on the next tick.
  - `key wakes and stale idle does not re-sleep`: after `setSystemIdle(200)`, a tick, `keyPulse()`, then 5 s of ticks, state is never `sleep`.
  - `click vs drag`: down→up within 4 px returns `'click'` and the state becomes `happy` with bubble `'click'`. Down→move 10 px returns true and the state is `drag`. `pointerUp()` then returns `'drag'` and the state is `idle`.
  - `click on sleeping bear wakes without happy`: the result is state `idle` with bubble null.
  - `keys ignored during drag`: state stays `drag`.
  - `typing`: a pulse gives state `typing`. 30 pulses give a `happy` animation within that typing period. 3100 ms after the last pulse, the state is back to `idle`.
  - `facing during typing points to the screen center`: `x < (minX+maxX)/2` gives `'right'`.
  - `on-fire once per 30 min`: 300 pulses (spaced 100 ms) give exactly one `'onfire'`. Another 300 within 30 min give none, and after 30 min they give one.
  - `random bubble within 20–40 min`: exactly one `'random'` appears between 20 and 40 min, and none while paused.
  - `paused`: state stays `idle`, dx is always 0, and key pulses are ignored.
- [ ] **Step 2:** Run `npx vitest run test/brain.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `renderer/brain.js`.** Any wake (key or click) resets the stored system idle to 0. `setBounds` clamps both x and the walk target. Walking with `maxX - minX < 1` goes straight back to idle. The happy animation from a click lasts `happyMs`.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all suites PASS.
- [ ] **Step 5: Commit** `feat: behavior brain state machine`.

### Task 4: Main process + preload

**Files:**
- Create: `main.js`, `preload.js`, `lib/presence.js`
- Test: `test/presence.test.js`

**Interfaces:**
- `lib/presence.js` (CommonJS): `presenceFrom(idleSeconds: number): 'active'|'idle'` (`'idle'` when ≥ 300).
- `window.bobee` (preload), with these members:
  - `moveBy(dx, dy)`
  - `moveTo(x, y)`
  - `dropToFloor()`
  - `setHeight(h)` (keeps the bottom edge fixed)
  - `setClickThrough(bool)`
  - `getBounds(): Promise<{ x, y, width, height, minX, maxX }>`
  - `onKeyPulse(cb)`
  - `onIdle(cb(seconds))`
  - `onBounds(cb(bounds))`
  - `onCommand(cb('pause'|'resume'|'say'))`
- IPC channel names: `move-by`, `move-to`, `drop-to-floor`, `set-height`, `set-click-through`, `get-bounds` (invoke), `key-pulse`, `idle`, `bounds`, `command`.

- [ ] **Step 1: Write a failing test:** `presenceFrom(0)='active'`, `presenceFrom(299)='active'`, `presenceFrom(300)='idle'`.
- [ ] **Step 2:** Run `npx vitest run test/presence.test.js`. Expected: FAIL. Then implement it and run again. Expected: PASS.
- [ ] **Step 3: Implement `main.js`.**
  - `protocol.registerSchemesAsPrivileged([{ scheme:'bobee', privileges:{ standard:true, secure:true, supportFetchAPI:true } }])` before ready. `protocol.handle('bobee', …)` maps `bobee://app/<path>` to `net.fetch(pathToFileURL(join(__dirname, path)))`. It returns 404 when the resolved path is outside `__dirname`.
  - Single-instance lock.
  - Create the window with the Global Constraints settings, then load `bobee://app/renderer/index.html`. Place it at `x = workArea.x + workArea.width/2`, `y = workArea.y + workArea.height - 200`. Call `setIgnoreMouseEvents(true, { forward: true })`.
  - IPC handlers clamp `x` to `[workArea.x, workArea.x + workArea.width - width]`. `minX`/`maxX` in bounds use that same range.
  - Poll `powerMonitor.getSystemIdleTime()` every 10 s, sending `idle` and keeping `presence` in a module variable.
  - Start `uIOhook` inside try/catch. On `keydown`, call `win.webContents.send('key-pulse')` with no payload. Stop the hook on `will-quit`.
  - On `screen` `display-metrics-changed`, call `dropToFloor`, re-clamp, and send `bounds`.
- [ ] **Step 4: Implement `preload.js`** with `contextBridge.exposeInMainWorld('bobee', …)` matching the interface.
- [ ] **Step 5: Stub `renderer/index.html`** with a red 64×64 div. Run `npm start`. Expected: a red square sits just above the taskbar, stays on top, doesn't appear in the taskbar or Alt+Tab, and no errors show in the terminal.
- [ ] **Step 6: Commit** `feat: main process, protocol, window and preload bridge`.

### Task 5: Renderer wiring

**Files:**
- Create: `renderer/index.html`, `renderer/style.css`, `renderer/bubble.js`, `renderer/app.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `createBubble(rootEl, { onResize(heightPx) }): { showMessage({ text, image?, from? }): void, visible(): boolean }`. Phase 2 will call `showMessage` and `player.playOverride`. `app.js` exposes both on `window.__bobee` for that.

- [ ] **Step 1: Write `index.html`, `style.css` and `bubble.js`.**
  - `index.html`: a `<canvas width=192 height=192>` anchored to the bottom, a `#bubble` above it, a `#zzz` overlay, and a CSP of `default-src 'self'; img-src 'self' data:`.
  - `style.css`: transparent background, no scrollbars.
  - `bubble.js`: the bubble fades in, stays 6000 ms, then fades out. It has a max width of 180 px and shows an optional `<img>` sign under the text. It calls `onResize(200 + bubbleHeight)` when shown and `onResize(200)` when hidden.
- [ ] **Step 2: Write `app.js`.**
  - Load messages: `fetch('/messages.json')`, then `parseMessages`, then `createPicker`. Load `/assets/bobee/sprites.json` if present for fps overrides.
  - Create the player and the brain using `getBounds()`, with `happyMs = player.durationOf('happy', 2)`.
  - Loop with `requestAnimationFrame`: `out = brain.tick(dt)`. If `dx` is nonzero, call `bobee.moveBy(dx, 0)` and `brain.setX(x + dx)`. Then call `player.play(out.animation)` and `setFacing`. Show `#zzz` when sleeping. For bubbles: `'click'` shows `nextClick()`, `'random'` shows `nextRandom()`, and `'onfire'` shows `"you're on fire 🔥"`.
  - Hit testing: on `mousemove`, call `setClickThrough(!player.isOpaqueAt(x, y))`, with the bubble counting as opaque while visible.
  - Pointer handling: `mousedown`, `mousemove` and `mouseup` on the canvas go to the brain. While dragging, call `bobee.moveTo(screenX - grabX, screenY - grabY)`. On a drag release, call `dropToFloor()` and then `setX` from `getBounds()`.
  - Wire `onKeyPulse` to `brain.keyPulse`, `onIdle` to `setSystemIdle`, and `onBounds` to `setBounds` + `setX`. For `onCommand`: pause/resume go to `setPaused`, and `say` shows `nextRandom()`.
- [ ] **Step 3:** Run `npm start` and check manually:
  - The placeholder bear idles and then walks, flipping when it walks left.
  - Clicks on empty pixels reach the desktop behind it.
  - A click shows happy plus a bubble. Dragging moves Bobee, and releasing drops it back to the floor.
  - Typing in another app makes Bobee face the center and cheer.
  - After 2 min without input, Bobee sleeps with "z", and a key press wakes it.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: renderer wiring, bubbles, drag and click-through`.

### Task 6: Tray, autostart, installer

**Files:**
- Modify: `main.js`, `package.json` (`build` section)

- [ ] **Step 1: Add the tray.**
  - Icon: `nativeImage.createFromPath(<idle strip, custom art first>)`, cropped to the first 64×64 frame and resized to 32.
  - Menu: Pause/Resume (label toggles, sends `command`), Say something (`command:'say'`), Start with Windows (checkbox), Quit.
  - Tooltip: `Bobee`.
- [ ] **Step 2: Add autostart.** Applies only when `app.isPackaged`. On first run, `settings.json` doesn't exist in `app.getPath('userData')`. In that case call `setLoginItemSettings({ openAtLogin: true })` and write `{ "autostartInitialized": true }`. The checkbox reads and writes `getLoginItemSettings().openAtLogin`.
- [ ] **Step 3: Add the `build` config.**
  - `appId: "com.bobee.companion"`, `productName: "Bobee"`.
  - `win.target: "nsis"`, `win.icon: "build/icon.png"`.
  - `nsis: { oneClick: true, artifactName: "Bobee Setup.exe" }`.
  - `files: ["main.js","preload.js","lib/**","renderer/**","assets/**","messages.json"]`.
- [ ] **Step 4:** Run `npm run dist`. Expected: `dist/Bobee Setup.exe` exists. Install it. Expected: Bobee launches, the tray icon appears, the menu works, and "Start with Windows" is checked.
- [ ] **Step 5: Commit** `feat: tray menu, autostart and Windows installer`.

### Task 7: Final verification

- [ ] Run `npx vitest run`. Expected: all suites PASS.
- [ ] Repeat the Task 5 Step 3 checklist on the installed build. Also check that a second launch doesn't create a second Bobee, and that changing the display scale repositions Bobee onto the floor.
- [ ] Add a README section: how to add art (`assets/bobee/`, format rules), how to edit `messages.json`, and how to build with `npm run dist`.
- [ ] Commit `docs: README with art and messages guide`.
