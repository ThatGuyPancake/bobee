# Bobee — Desktop Companion Design

Date: 2026-10-21

## Purpose

Bobee is a cute bear desktop companion, built as a gift. It lives on the
desktop, wanders and naps, shows sweet personal messages, and reacts when
she types. The sprites are hand-drawn by the gift giver.

Success means:
- She installs it with a single `Bobee Setup.exe` and it starts with Windows.
- It feels alive and sweet, and it never gets in the way of her work.
- It works fully offline, with no accounts and no data leaving the machine.

## Scope

In v1: wander, idle, sleep, drag, click reaction, speech-bubble messages,
typing reactions, tray menu, autostart, Windows installer.

Not in v1: remote features (phase 2, see "Phase 2 readiness"), reminders/pomodoro, multi-monitor roaming, AI chat, settings
window, macOS/Linux builds.

## Platform and stack

- Windows 10/11 only.
- Electron (latest stable) with plain JavaScript. No frontend framework.
- `uiohook-napi` for the global keyboard hook.
- `electron-builder` for the NSIS installer.
- `vitest` for unit tests.

## Components

### Main process (`main.js`)
- Creates one pet window: transparent, frameless, `alwaysOnTop` at the
  `screen-saver` level, `skipTaskbar`, not resizable, not focusable by
  default, 200×200 px.
- Places the window on the primary display, resting on the top edge of the
  work area (above the taskbar).
- Click-through: the window calls `setIgnoreMouseEvents(true, { forward: true })`.
  The renderer reports when the cursor is over an opaque sprite pixel, and
  main turns click-through off only while that's true.
- Moves the window when the renderer requests it (walking, dragging). It
  clamps x to the work area, keeps y fixed while walking, and allows free
  movement while dragging. On release, Bobee drops back to the floor line.
- Keyboard hook: listens for `keydown` and forwards only a "key pressed"
  pulse to the renderer. Key codes are never read, stored or sent.
- Global idle detection uses `powerMonitor.getSystemIdleTime()`, polled
  every 10 s.
- Tray: Pause/Resume, Say something, Start with Windows (checkbox, default
  on, via `app.setLoginItemSettings`), Quit.
- Single-instance lock, so only one Bobee runs at a time.

### Preload (`preload.js`)
Exposes a small `window.bobee` API through `contextBridge`: `moveBy(dx, dy)`,
`moveTo(x, y)`, `setClickThrough(bool)`, `getBounds()`,
`onKeyPulse(cb)`, `onIdle(cb)`, `onCommand(cb)` (pause, resume, say).
Node integration stays off, and context isolation stays on.

### Sprite player (`renderer/sprite.js`)
- Loads `assets/bobee/<name>.png` for each animation: idle, walk, sleep,
  drag, happy.
- Strip format: frames laid horizontally, each 64×64 px. Frame count is
  `image.width / 64`.
- Draws onto a canvas at 3× scale with `imageSmoothingEnabled = false`.
- Plays at 8 fps by default (each animation's fps can be overridden in
  `assets/bobee/sprites.json`, which is optional).
- Mirrors horizontally when facing left. The source art faces right.
- If a strip is missing, it falls back to `assets/placeholder/<name>.png`.
- `isOpaqueAt(x, y)` checks pixel alpha for click-through hit testing.

### Behavior brain (`renderer/brain.js`)
A pure state machine with an injectable clock and random number generator,
so it can be unit tested.

States and transitions:
- `idle`: lasts 3–8 s, then `walk` (70%) or stays `idle` (30%).
- `walk`: picks a target x within the work area and moves 40 px/s toward
  it. Goes back to `idle` on arrival.
- `sleep`: entered from `idle` or `walk` when the system has been idle for
  120 s or more. Bobee wakes (to `idle`) on a click or keyboard activity.
  A floating "z" overlay is drawn on top.
- `drag`: entered on mousedown and drag past 4 px. When released, Bobee
  goes to `idle`.
- `happy`: entered on a click (mousedown and mouseup within 4 px). Plays
  the strip twice, then returns to `idle`.
- `typing`: entered on a key pulse when awake and not dragging. Bobee
  faces the screen center and uses the `idle` strip, with `happy` played
  for 1 s every 30 key pulses. It leaves `typing` 3 s after the last pulse.
  A streak of 300 or more pulses without a 3 s gap triggers a "you're on
  fire 🔥" bubble, at most once every 30 minutes.
- Paused (from the tray): Bobee stays in `idle`, and no walking or bubbles
  happen.

The brain outputs `{ animation, facing, dx, bubble }` each tick. The
renderer applies the output.

### Speech bubbles (`renderer/bubble.js`)
- A DOM bubble above the sprite that fades in, stays 6 s, then fades out.
  It wraps at 180 px width.
- Messages come from `messages.json` (`{ "random": [...], "click": [...] }`),
  bundled with the app.
- A random message shows every 20–40 minutes while awake and not paused.
  The same message never shows twice in a row.
- A click picks from `click` (and falls back to `random` if `click` is
  empty).
- The tray's "Say something" option shows a random message immediately.
- While a bubble is visible, the window height grows upward to fit the
  bubble, and Bobee's feet stay on the floor line.

## Phase 2 readiness (Bobee Link)

Phase 2 will add remote features, specified separately: a relay server, a
web page for the gift giver showing coarse presence (active / idle /
offline), queued messages, and doodles. v1 builds three seams so phase 2
plugs in without rework. v1 includes no networking.

- **Message source:** `bubble.js` accepts messages through a
  `showMessage({ text, image?, from? })` function, not only from
  `messages.json`. Phase 2 will call it for incoming messages. `image` is
  a data URL drawn as a "sign" Bobee holds under the text.
- **Temporary sprite override:** the sprite player exposes
  `playOverride(stripImage, { durationMs })`, which plays a provided strip
  (same 64×64 format) in place of the normal animation and then returns to
  normal.
- **Presence signal:** main emits a `presence` value (`active`, or `idle`
  after 5 minutes of system idle time). In v1 this is internal only.
  Phase 2 will report it, with a visible tray toggle so she can see and
  control sharing.

## Assets

- `assets/placeholder/`: simple 64×64 placeholder bear strips that ship in
  the repo, so the app runs before any custom art exists.
- `assets/bobee/`: the gift giver's art, in the same format, which
  overrides the placeholders.
- Art guidelines: transparent background, the bear faces right, feet on
  the same line about 4 px above the bottom edge in every frame.
- App icon and tray icon are generated from the first idle frame.

## Error handling

- A missing or malformed `messages.json` falls back to a built-in list of
  messages and logs a warning.
- A sprite whose width isn't a multiple of 64 is treated as one frame of
  that width, and a warning is logged.
- If the keyboard hook fails to start, typing reactions are disabled and
  everything else keeps working.
- If the display changes (resolution or taskbar move), Bobee repositions
  to the floor of the new work area.

## Testing

- Unit tests (`vitest`): brain transitions with a fake clock and seeded
  random numbers (idle→walk, sleep on idle time, wake on key, click vs.
  drag threshold, typing streak and its cooldown, pause), message picker
  never repeating, and strip frame-count math.
- Manual check on Windows: the window appears above the taskbar, clicks
  pass through empty pixels, drag works, Bobee sleeps after idle and wakes
  on a key, typing reactions work, bubbles show, and the tray actions and
  autostart toggle work. Also check that the installer builds and installs.

## Project layout

```
package.json
main.js
preload.js
renderer/index.html
renderer/style.css
renderer/app.js        wires sprite, brain, bubble together
renderer/sprite.js
renderer/brain.js
renderer/bubble.js
assets/placeholder/*.png
assets/bobee/          (custom art goes here)
messages.json
test/brain.test.js
test/sprite.test.js
test/messages.test.js
```
