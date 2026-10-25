# Bobee Play & Personality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bobee lives on screen all the time (asleep in the bottom-right corner between visits), likes being petted, has moods and a daily rhythm, wears seasonal outfits, and eats treats dragged from a jar.

**Architecture:** Most of the new logic goes in small modules with no Electron or DOM access: `renderer/visits.js`, `renderer/petting.js`, `renderer/mood.js`, `renderer/outfits.js`, `lib/jar.js` and `lib/store.js`, all unit-tested with vitest. `renderer/brain.js` swaps its `away` state for a `home` corner and gains a generic `moment()` API. `renderer/app.js` wires the modules together. `main.js` owns saved state and the jar and treat windows. All art is drawn in code by `art/make-states.js` and a new `art/make-props.js`, and checked by `scripts/lint-sprites.js`.

**Tech Stack:** Electron 45, plain JavaScript (ES modules in `renderer/`, CommonJS in `lib/`, `main.js` and `scripts/`), vitest, pngjs, electron-builder.

**Spec:** `docs/superpowers/specs/2026-10-25-bobee-play-and-personality-design.md`

## Global Constraints

- Everything stays offline. Nothing leaves the PC. State lives only in `app.getPath('userData')/bobee-state.json`.
- He never blocks clicks: every window uses `setIgnoreMouseEvents(true, { forward: true })` except while the cursor is over its own opaque pixels.
- He never gets sad, sulks or asks for attention. Happiness never drops below 60.
- All new art is drawn in code from `art/bobee-master.png`. No AI art. Every new strip and prop must pass `node scripts/lint-sprites.js`.
- Strips are 96×96 frames, facing right, feet on the bottom row, top 4 rows free.
- Times use her local clock, and dates follow Germany.
- Each milestone ends with a version bump in `package.json`, `npm test` green, `npm run dist` building, and a check in the running app (`npm start`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run tests with `npx vitest run --exclude ".claude/**"`, so test copies in session worktrees aren't picked up.

## Review Focus

1. **The PC sleeps overnight and wakes up.** Expected: on resume he's asleep at home, happiness has settled back (capped at 24 h of elapsed time), and the day-based fields are reset. Pinned in Task 1 (`normalizeState` with a stale day) and Task 8 (settling back after 3 days).
2. **A treat drag ends somewhere unexpected** (released over the taskbar or another window, alt-tab mid-drag, the drag window losing capture). Expected: the treat returns to the jar and the treat window closes, never left following the cursor. Pinned in Task 16 (`createJarSession` release, miss and cancel).
3. **She drags him while he's asleep, or clicks him while he's walking home.** Expected: the drag works, and after the drop he stays awake `NAP_WAKE_MS`, then walks home and lies down. A click on the way home wakes him in place. Pinned in Task 3.
4. **Pause while the jar is out or a treat is mid-drag.** Expected: the jar and treat windows close at once, and on resume he's asleep at home. Pinned in Task 16 (`cancel()`) and Task 18 (pause step).
5. **An older `messages.json` without the new groups.** Expected: built-in defaults for each missing group, and the existing groups unchanged. Pinned in Task 9.

## File Map

| File | Status | Job |
|---|---|---|
| `lib/store.js` | create | normalize, load and save `bobee-state.json` |
| `renderer/visits.js` | create | visit plan constants and `makePlan` |
| `renderer/brain.js` | modify | home corner, wake in place, walk home, moments, phase and mood input |
| `renderer/petting.js` | create | pointer samples to pet events |
| `renderer/mood.js` | create | happiness, levels, day phase |
| `renderer/messages.js` | modify | new message groups, weighted sweet |
| `renderer/outfits.js` | create | outfit calendar, Easter, overlay drawing |
| `renderer/sprite.js` | modify | new strip names, overlay hook |
| `renderer/app.js` | modify | wiring |
| `renderer/jar.html`, `renderer/jar.js`, `preload-jar.js` | create | jar and treat window views |
| `lib/jar.js` | create | jar schedule, placement, hit test, drag session |
| `main.js`, `preload.js` | modify | state IPC, config IPC, tray items, jar windows |
| `art/make-states.js` | modify | new strips, `anchors.json` |
| `art/make-props.js` | create | outfit pieces, jar, treats, `props.json` |
| `scripts/lint-sprites.js` | modify | also lint `assets/props/` |
| `messages.json`, `assets/bobee/sprites.json`, `README.md`, `package.json` | modify | content, fps, docs, version, build files |

---

## Milestone 1 — 1.4.0 Always on screen

### Task 1: Saved state (`lib/store.js`) and state IPC

**Files:**
- Create: `lib/store.js`
- Modify: `main.js` (IPC, load on start, save on quit), `preload.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces (CommonJS):
  - `DEFAULT_STATE = { version: 1, happiness: 60, updatedAt: null, day: null, jarsShown: 0, lunchSnack: false, said: [], outfits: true }`
  - `normalizeState(raw: any, now: Date) => State`
  - `dayKey(date: Date) => 'YYYY-MM-DD'`, using local time
  - `createStore(file: string, { now = () => new Date(), fs = require('node:fs') } = {}) => { get(): State, patch(p: Partial<State>): State, flush(): void }`
- IPC: `ipcMain.handle('get-state')` returns `store.get()`. `ipcMain.on('patch-state', (e, p))` applies a patch, but only for the keys of `DEFAULT_STATE` with the right types.
- Preload: `window.bobee.getState(): Promise<State>` and `window.bobee.patchState(p)`.

- [ ] **Step 1: Write the failing tests** in `test/store.test.js`, loading the module with `createRequire` as `test/presence.test.js` does:
  - `normalizeState(null, d)` returns `DEFAULT_STATE` with `day === dayKey(d)`.
  - `normalizeState('garbage', d)` and `normalizeState({ happiness: 'x' }, d)` give `happiness === 60`.
  - `normalizeState({ happiness: 140 }, d).happiness === 100`, and `{ happiness: 10 }` gives `60`.
  - Stale day: `normalizeState({ day: '2026-10-24', jarsShown: 2, lunchSnack: true, said: ['morning'], happiness: 80, outfits: false }, new Date(2026, 9, 25, 9))` gives `jarsShown: 0`, `lunchSnack: false` and `said: []`, while `happiness: 80` and `outfits: false` are kept.
  - `createStore` with a fake `fs` whose `readFileSync` throws gives defaults. `patch({ jarsShown: 1 })` then `flush()` writes to `file + '.tmp'` and renames it to `file`.
- [ ] **Step 2: Run** `npx vitest run test/store.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/store.js`.** `patch` marks the state dirty. `flush` writes only if dirty. The store also schedules a flush 10 s after the first unsaved patch, via `setTimeout(...).unref?.()`. `get()` calls `normalizeState` again when the day has changed.
- [ ] **Step 4: Wire `main.js`.** Create the store in `app.whenReady` at `path.join(app.getPath('userData'), 'bobee-state.json')`. Add the two IPC handlers using the existing `trusted(e)` check, and call `store.flush()` in `will-quit`. Add `getState` and `patchState` to `preload.js`.
- [ ] **Step 5: Run** `npx vitest run --exclude ".claude/**"`. Expected: all PASS.
- [ ] **Step 6: Commit** with the message `feat: saved state for Bobee's mood and day`.

### Task 2: Move the visit plan to `renderer/visits.js`

**Files:**
- Create: `renderer/visits.js`
- Modify: `renderer/brain.js` (remove the moved constants and `makePlan`)
- Test: `test/visits.test.js`

**Interfaces:**
- Produces (ES module): `HOUR_MS`, `VISITS_PER_HOUR = 6`, `VISIT_BUDGET_MS = 600000`, `VISIT_MIN_MS = 85000`, `VISIT_MAX_MS = 100000`, `VISIT_JITTER_MS = 120000`, and `makePlan(random: () => number, withHello: boolean, durFactor = 1) => Array<{ start: number, dur: number }>`.
- `durFactor` multiplies each `dur`. Evening uses `0.7`.

- [ ] **Step 1: Write the failing tests.**
  - `makePlan(() => 0, true)` gives 6 entries, `[0].start === 0`, and the starts are `i * 600000` for i ≥ 1.
  - `makePlan(() => 0.5, false, 0.7)` gives every `dur === (85000 + 0.5 * 15000) * 0.7`.
  - Starts are strictly increasing for `random = () => 0.999`.
- [ ] **Step 2: Run** `npx vitest run test/visits.test.js`. Expected: FAIL.
- [ ] **Step 3: Move** the constants and `makePlan` out of `brain.js` and import them back. The body is unchanged apart from `durFactor`.
- [ ] **Step 4: Run all tests.** Expected: PASS, including the existing `test/brain.test.js`.
- [ ] **Step 5: Commit** with the message `refactor: move the visit plan out of brain.js`.

### Task 3: Brain — home corner, wake in place, walk home, moments

**Files:**
- Modify: `renderer/brain.js`
- Test: `test/brain.test.js`. Rewrite the visit tests that expect `away` or `visible === false`, and add the new ones.

**Interfaces:**
- Consumes: `makePlan` from Task 2.
- Produces, as changes to `createBrain` options and its returned API:
  - The `away` state and `visible: false` are gone. `tick()` always returns `visible: true`.
  - New states:
    - `home`: asleep at `px === hi`, plays the `sleep` animation.
    - `waking`: plays `yawn`, lasts `yawnMs`, then `wave`, then normal visit behaviour.
    - `dozing`: plays `yawn`, lasts `yawnMs`, then `sleep`, or `home` if `px === hi`.
    - `homing`: walks to `hi` at `WALK_SPEED` with easing, plays `walk`, then `dozing`.
  - `sleep` remains for "asleep in place" (screen idle away from home, or a drag drop at night).
  - New constant `NAP_WAKE_MS = 60000`.
  - `moment(name: string, ms: number)`: plays a timed animation. If called while in `home` or `sleep` it returns to that state afterwards, otherwise to `idle`. It's ignored while dragging or when `ms <= 0`. Used for `pet`, `sleep-pet`, `sleep-peek`, `munch` and `happy`.
  - `wakeHere()`: from `home` or `sleep`, goes to `idle` with an awake timer of `NAP_WAKE_MS`. When the timer runs out (and no visit is active), he goes `homing`, then `dozing`, then `home`. Used for clicks, treats and the tray's "Say something".
  - `setPhase(phase: 'morning'|'lunch'|'day'|'evening'|'night')`: at `night`, due visits are skipped and he never leaves `home`. At `evening`, the next hour's plan uses `durFactor 0.7`.
  - The output gains `event: 'visit-start' | 'visit-end' | null`, reported once.
  - `keyPulse()` while in `home`, `sleep`, `dozing` or `homing` only resets the system idle time. No `typing` state and no wake.
  - Screen idle (`systemIdle >= SLEEP_IDLE_S`) while awake ends any visit: `homing`, then `dozing`, then `home`. Visits don't start while the screen is idle (unchanged).
  - `pointerUp()` click while in `home` or `sleep`: at `night` it calls `moment('sleep-peek', peekMs)`, otherwise `wakeHere()` followed by the click reaction. A drag from `home` or `sleep` works as now. After the drop he's `idle` with the `NAP_WAKE_MS` timer.
  - `summon()`: from `home` or `sleep` it calls `wakeHere()` and sets `visitLeft = SUMMON_MS`. Otherwise it behaves as now.
  - `createBrain` gains the option `peekMs = 0`, which `app.js` passes as `player.durationOf('sleep-peek', 1)`.

- [ ] **Step 1: Write the failing tests.** Use the existing `run()` and `seeded()` helpers, with `visits: true, yawnMs: 500, waveMs: 500`.
  - `starts asleep at home`: `tick(100)` gives `state === 'home'`, `x === maxX` and `visible === true`.
  - `a visit wakes him, he wanders, then walks home and dozes off`: over 3 minutes of 1 s ticks, the states include `waking`, then `wave`, then `idle` or `walk`, then `homing`, then `dozing`, then `home`, in that order. `event === 'visit-start'` appears exactly once and `'visit-end'` exactly once.
  - `awake at most 10 minutes per active hour`: over 3 h, awake means the state is not `home` or `sleep`, and is at most 600 s per hour and more than 300 s per hour.
  - `click while home wakes him in place, then he goes home after NAP_WAKE_MS`: from home at `x = maxX`, `pointerDown` then `pointerUp` gives `'click'` and he's awake. After 61 s with no visit due, the states include `homing` (if he walked) or `dozing`, and end in `home`.
  - `drag from home, drop, stays awake ~60s, then walks back`: `pointerDown`, `pointerMove` 10 px, `pointerUp` gives `'drag'`. `setX(200)`. Ticking 70 s reaches `homing`, and he ends at `x === maxX` in `home`.
  - `night: no visits and a click only peeks`: with `setPhase('night')`, two hours of ticks all have `state === 'home'`. A click calls `moment('sleep-peek')`, so `animation === 'sleep-peek'` for `peekMs`, then `home` again.
  - `typing never wakes him at home`: 50 `keyPulse()` calls while in `home` leave him in `home`.
  - `screen idle mid-visit sends him home`: during a visit, `setSystemIdle(200)` leads to `homing`, then `dozing`, then `home` within 60 s.
  - `moment returns to where it started`: `moment('pet', 500)` from `idle` returns to `idle`. `moment('sleep-pet', 500)` from `home` returns to `home`.
- [ ] **Step 2: Run** `npx vitest run test/brain.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement it in `renderer/brain.js`.**
  - Replace `gone()` and `walkIn()`: a visit now starts in place with `waking`.
  - Replace `leave()`: it now targets `hi` and sets the state to `homing`.
  - Remove the `enter`, `exit` and `away` states, `popIn()`, the grace period and the edge-margin handling.
  - Keep the typing, on-fire, mood-free idle choices and visit budget logic as they are.
  - Keep `setBounds` re-clamping `px` and pinning `home` to the new `hi`.
- [ ] **Step 4: Run all tests.** Expected: PASS. Old tests that described walking on and off screen are rewritten or deleted, not skipped.
- [ ] **Step 5: Commit** with the message `feat: Bobee lives in the corner and naps between visits`.

### Task 4: App wiring for milestone 1, and release 1.4.0

**Files:**
- Modify: `renderer/app.js`, `main.js`, `preload.js`, `README.md`, `package.json`

**Interfaces:**
- Consumes: Task 3's brain API, Task 1's `getState`.
- Produces:
  - `ipcMain.handle('get-config')` returns `{ debugDate: string | null }`. `debugDate` is `process.env.BOBEE_DATE` only when `!app.isPackaged`, otherwise `null`.
  - Preload: `getConfig()`.
  - In `app.js`, `now(): Date`. If `debugDate` is set, it's that date plus the elapsed `performance.now()` time. Otherwise it's `new Date()`. Later tasks use `now()` for every date and time lookup.

- [ ] **Step 1: Pause hides him.** On the `pause` command, add the `away` class to `wrap`, turn click-through on and call `brain.setPaused(true)`. On `resume`, remove the class, call `brain.setPaused(false)`, and if he isn't `home`, call `brain.setX(bounds.maxX)` so he's asleep at home. Remove the old `hidden`/`out.visible` toggling, since he's always visible.
- [ ] **Step 2: Phase from the clock.** Until Task 8 adds `phaseOf`, add a temporary `phaseOf` to `app.js` that returns `'night'` for hours 0–5 and `'day'` otherwise. Call `brain.setPhase(...)` once a minute and on start. Remove the margin and off-screen sliding code (`wrap.style.transform` translate, `margin` option), since he never leaves the window range now.
- [ ] **Step 3: Run** `npx vitest run --exclude ".claude/**"`. Expected: PASS.
- [ ] **Step 4: Check in the app.** Run `npm start`. He should start asleep in the bottom-right corner. Tray → Say something wakes him and he waves. A click wakes him, and a minute later he walks home and lies down. Pause hides him and Resume shows him asleep at home. With `BOBEE_DATE=2026-10-25T02:00` set before `npm start`, a click only peeks (once Task 10's strip exists; until then it falls back to `sleep`).
- [ ] **Step 5: Release.** Set `"version": "1.4.0"`. In the README, replace the visit description with the home corner behaviour. Run `npm run dist`. Expected: `dist/Bobee Setup.exe` is built.
- [ ] **Step 6: Commit** with the message `feat: release v1.4.0, Bobee always on screen`.

---

## Milestone 2 — 1.4.1 Petting

### Task 5: Pet gesture detector (`renderer/petting.js`)

**Files:**
- Create: `renderer/petting.js`
- Test: `test/petting.test.js`

**Interfaces:**
- Produces: `createPetting({ windowMs = 1500, minTurns = 3, minStroke = 6, cooldownMs = 4000 } = {}) => { sample(x: number, t: number, overBobee: boolean, buttonDown: boolean): boolean, reset(): void }`. It returns `true` exactly once per detected pet.

- [ ] **Step 1: Write the failing tests.**
  - Strokes of x = 0, 10, 0, 10, 0 at t = 0, 200, 400, 600, 800, all over Bobee with no button, return `true` on the sample that completes the third direction change, and `false` on every other sample.
  - The same moves with 4 px strokes never return `true`.
  - The same moves spread across 2000 ms never return `true`.
  - A sample with `overBobee: false` in the middle resets the run, so there's no pet.
  - `buttonDown: true` gives no pet.
  - A second identical gesture starting at t = 1000 gives no pet (cooldown). One starting at t = 5000 gives a pet.
- [ ] **Step 2: Run** `npx vitest run test/petting.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Keep samples within `windowMs`. A turn counts when the sign of the x movement flips and the stroke before the flip is at least `minStroke`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: detect petting from mouse strokes`.

### Task 6: `pet` and `sleep-pet` strips

**Files:**
- Modify: `art/make-states.js`, `renderer/sprite.js` (`NAMES`, `DEFAULT_FPS`), `assets/bobee/sprites.json`, `scripts/make-placeholders.js`, `README.md` (animation table)
- Generated: `assets/bobee/pet.png`, `assets/bobee/sleep-pet.png`, and the placeholders

**Interfaces:**
- Produces: strips `pet` (6 frames, fps 7) and `sleep-pet` (4 frames, fps 4).

- [ ] **Step 1: Draw `pet`** with the existing helpers. Over 6 frames: closed eyes (`eyes(b, 'closed')`), `blush`, the head shifted 1 px towards the side then back (`moveHead`), and one `heart` per frame rising from above the head, staying within the top 4 free rows. The mug is held as in `idle`.
- [ ] **Step 2: Draw `sleep-pet`** from the `sleep` pose. Over 4 frames: a smile mouth, a 1 px head wiggle, and one small heart in place of a Z.
- [ ] **Step 3: Register both** in `NAMES` and `DEFAULT_FPS`, add them to `sprites.json`, and add placeholder versions in `make-placeholders.js`.
- [ ] **Step 4: Regenerate and lint.** Run `node art/make-states.js assets/bobee preview.png`, then `node scripts/lint-sprites.js`. Expected: every strip `ok`. Look at `preview.png`.
- [ ] **Step 5: Run all tests.** Expected: PASS. `test/sprite.test.js` stays green.
- [ ] **Step 6: Commit** with the message `feat: pet and sleep-pet animations`.

### Task 7: Wire petting, and release 1.4.1

**Files:**
- Modify: `renderer/app.js`, `package.json`, `README.md`

- [ ] **Step 1: Feed the detector.** In the `mousemove` listener, when not pressed, call `petting.sample(e.screenX, performance.now(), opaqueAt(e) && !bubbleEl.contains(e.target), e.buttons !== 0)`.
- [ ] **Step 2: React to a pet.** If he's in `home` or `sleep`, call `brain.moment('sleep-pet', player.durationOf('sleep-pet', 1))`. Otherwise call `brain.moment('pet', player.durationOf('pet', 1))`.
- [ ] **Step 3: Check in the app.** Stroking him while he's awake plays `pet`. While he's asleep it plays `sleep-pet` and he stays asleep. Hovering without stroking only wiggles. A second pet within 4 s does nothing.
- [ ] **Step 4: Release.** Set `"version": "1.4.1"`, add petting to the README, and run `npm run dist`.
- [ ] **Step 5: Commit** with the message `feat: release v1.4.1, petting`.

---

## Milestone 3 — 1.4.2 Moods and daily rhythm

### Task 8: Mood and day phase (`renderer/mood.js`)

**Files:**
- Create: `renderer/mood.js`
- Modify: `renderer/app.js` (replace the temporary `phaseOf` from Task 4)
- Test: `test/mood.test.js`

**Interfaces:**
- Produces:
  - `REST = 60`, `GAINS = { pet: 2, click: 1, treat: 8 }`, `HALF_LIFE_MS = 3 * 3600000`, `MAX_ELAPSED_MS = 24 * 3600000`
  - `settle(value: number, elapsedMs: number) => number`: computes `REST + (value - REST) * 0.5 ** (min(elapsed, MAX) / HALF_LIFE_MS)`, never below `REST`
  - `createMood({ happiness = REST, updatedAt = null }, nowMs: number) => { add(kind: 'pet'|'click'|'treat', nowMs): number, value(nowMs): number, level(nowMs): 'content'|'happy'|'overjoyed', snapshot(nowMs): { happiness, updatedAt: ISOString } }`
  - `levelOf(v)`: below 75 is `content`, 75–89.999 is `happy`, 90 and up is `overjoyed`
  - `phaseOf(date: Date) => 'night'|'morning'|'day'|'lunch'|'evening'`: hours 0–5 are `night`, 6–10 `morning`, 11 `day`, 12–13 `lunch`, 14–19 `day`, 20–23 `evening`

- [ ] **Step 1: Write the failing tests.**
  - `settle(80, 3h)` is 70 ± 1e-9. `settle(80, 0)` is 80. `settle(50, 1h)` is 60.
  - Elapsed time is capped at 24 h: `settle(100, 72h)` equals `settle(100, 24h)`.
  - `createMood({}, 0).add('treat', 0)` is 68. Adding `treat` 10 times caps at 100.
  - `level` is `content` at 74.9, `happy` at 75 and `overjoyed` at 90.
  - `createMood({ happiness: 90, updatedAt: new Date(0).toISOString() }, 3 * 86400000).value(...)` equals `settle(90, 24h)` (the resume case).
  - `phaseOf` at 05:59 is `night`, 06:00 `morning`, 11:00 `day`, 12:00 `lunch`, 14:00 `day`, 20:00 `evening`, and 23:59 `evening`.
- [ ] **Step 2: Run** `npx vitest run test/mood.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement it**, and import `phaseOf` in `app.js` in place of the temporary one.
- [ ] **Step 4: Run all tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: Bobee's mood and the parts of the day`.

### Task 9: New message groups and weighted sweet

**Files:**
- Modify: `renderer/messages.js`, `messages.json`, `README.md` (the Editing messages section)
- Test: `test/messages.test.js`

**Interfaces:**
- Produces:
  - `EXTRA_GROUPS = ['morning','lunch','evening','treat','yum','full','winter','christmas','newyear','valentine','easter','spring','summer','halloween']`
  - `DEFAULT_MESSAGES` gains one default per extra group. These are the exact lines:
    - `morning`: "good morning ☀️"
    - `lunch`: "lunch time! 🥪"
    - `evening`: "don't stay up too late 🌙"
    - `treat`: "ooh, snacks? 🍯"
    - `yum`: "yum! 🍪"
    - `full`: "I'm so full! 🐻"
    - `winter`: "brr, cozy scarf time 🧣"
    - `christmas`: "Merry Christmas! 🎄"
    - `newyear`: "Happy New Year! 🎉"
    - `valentine`: "Happy Valentine's ❤️"
    - `easter`: "Happy Easter! 🐣"
    - `spring`: "spring is here 🌸"
    - `summer`: "summer vibes 😎"
    - `halloween`: "boo! 🎃"
  - `parseMessages` keeps each extra group from the file if it's valid, otherwise uses its default.
  - `createPicker(...)` gains `next(group: string) => string[]` and `nextRandom({ sweetWeight = 1 } = {})`. With `sweetWeight: 2`, `sweet` is picked twice as often as each other group.

- [ ] **Step 1: Write the failing tests.**
  - `parseMessages('{"sweet":["hi"]}')` gives `.morning` deep-equal to `[["good morning ☀️"]]` (the old-file case). The sweet, jokes, facts and click results are unchanged from today's behaviour.
  - A file with `"yum": ["nom"]` gives `.yum` equal to `[["nom"]]`.
  - `picker.next('full')` returns `["I'm so full! 🐻"]` with the defaults.
  - With `random` cycling 0, 0.25, 0.5 and 0.75, and the groups sweet, jokes and facts, `nextRandom({ sweetWeight: 2 })` lands on sweet for random values below 0.5 (weights 2:1:1).
- [ ] **Step 2: Run** `npx vitest run test/messages.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Add the 14 groups to `messages.json` with the default lines above, plus one or two extra lines each in the same voice.
- [ ] **Step 4: Run all tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: messages for the day's rhythm, treats and holidays`.

### Task 10: `sleep-peek` and `munch` strips

**Files:**
- Modify: `art/make-states.js`, `renderer/sprite.js`, `assets/bobee/sprites.json`, `scripts/make-placeholders.js`, `README.md`

**Interfaces:**
- Produces: strips `sleep-peek` (4 frames, fps 4) and `munch` (6 frames, fps 8).

- [ ] **Step 1: Draw `sleep-peek`** from the sleep pose: both eyes closed, then one eye open for frames 1–2, then closed. No Zs on the open frames.
- [ ] **Step 2: Draw `munch`.** The mug is held low and one paw is raised to the mouth. The mouth alternates open and closed (`mouth(b, 'open')` / `'normal'`), and 1–2 crumb pixels in the muzzle colour fall below the chin on frames 2 and 4. Eyes are `happy` on the last two frames.
- [ ] **Step 3: Register both, regenerate, lint and preview**, as in Task 6, Steps 3 and 4. Expected: every strip `ok`.
- [ ] **Step 4: Run all tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: sleep-peek and munch animations`.

### Task 11: Mood and rhythm in the brain

**Files:**
- Modify: `renderer/brain.js`
- Test: `test/brain.test.js`

**Interfaces:**
- Consumes: Task 3's `setPhase` and `moment`.
- Produces:
  - `setMood(level: 'content'|'happy'|'overjoyed')`.
  - Idle choices when an idle spell ends:
    - walk: 0.7
    - sip: 0.2, or 0.4 in `morning` (taken from the walk share)
    - happy moment (`happyMs`): 0.1 extra when the level is `happy` or `overjoyed`
    - wave (`waveMs`): 0.05 extra when `overjoyed`
    - yawn as a moment (returns to idle, `yawnMs`): 0.1 in `evening`
  - The extras are taken from the "stay idle" share, and the total never goes above 1.

- [ ] **Step 1: Write the failing tests.** Count moments over 2 h of awake time, using a seeded random and `visits: false`.
  - In `morning`, `sip` comes up at least 1.6 times as often as in `day`.
  - At `overjoyed`, `happy` moments appear and `wave` appears unprompted. At `content`, neither appears unprompted.
  - In `evening`, `yawn` appears and every yawn is followed by `idle`, never `sleep`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement it** in the idle branch of `tick`.
- [ ] **Step 4: Run all tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: mood and time of day shape what Bobee does`.

### Task 12: Wire mood and rhythm, and release 1.4.2

**Files:**
- Modify: `renderer/app.js`, `package.json`, `README.md`

- [ ] **Step 1: Load and save mood.** On start, call `getState()` and run `createMood(state, Date.now())`. Clicks call `mood.add('click')` and pets call `mood.add('pet')`. After each change, call `patchState(mood.snapshot(Date.now()))`. Once a minute, call `brain.setMood(mood.level(Date.now()))`, and save the snapshot only if the value has moved by at least 0.5.
- [ ] **Step 2: Weighted sweet.** Random bubbles use `picker.nextRandom({ sweetWeight: level === 'content' ? 1 : 2 })`.
- [ ] **Step 3: Visit-start rules.** On `event === 'visit-start'`:
  - If `!state.said.includes('morning')` and the phase is `morning`, say `next('morning')` and patch `said`.
  - If the phase is `lunch` and `!state.lunchSnack`, call `brain.moment('munch', durationOf('munch', 2))`, say `next('lunch')` and patch `lunchSnack: true`.
  - If the phase is `evening`, there's a 50% chance to say `next('evening')` instead of the first random bubble.
- [ ] **Step 4: Check in the app** with `BOBEE_DATE` set to 07:00 (good morning on the first visit), 12:30 (a munch and the lunch line) and 21:00 (evening lines, more yawns). After about 10 pets, the next visit shows extra hops.
- [ ] **Step 5: Release.** Set `"version": "1.4.2"`, add mood and rhythm to the README, and run `npm run dist`.
- [ ] **Step 6: Commit** with the message `feat: release v1.4.2, moods and daily rhythm`.

---

## Milestone 4 — 1.4.3 Seasonal outfits

### Task 13: Outfit art, head anchors, prop lint

**Files:**
- Create: `art/make-props.js`, `assets/props/*.png`, `assets/props/props.json`
- Modify: `art/make-states.js` (writes `assets/bobee/anchors.json`), `scripts/lint-sprites.js` (adds `assets/props/*.png` to `defaultFiles`), `test/lint-sprites.test.js`

**Interfaces:**
- Produces:
  - `assets/bobee/anchors.json`: `{ "<strip>": [[x, y], ...] }`, with one entry per frame for every strip in `NAMES`. Each point is the top-centre of the head (the topmost fur pixel between the ears, at the head's horizontal centre) in 96×96 frame coordinates, after `place()`'s vertical shift. Work it out from the master's head point plus each frame's `moveHead` offset and `shiftOf`.
  - `assets/props/props.json`: `{ "<name>": { "slot": "hat"|"neck"|"face", "pivot": [x, y] } }`. The pivot is the prop pixel that sits on the anchor point.
  - Props: `santa-hat`, `party-hat` (with 3–4 confetti pixels), `heart-clip`, `bunny-ears`, `flower-crown`, `pumpkin-hat`, `scarf`, `sunglasses`.
  - For `neck` and `face` props, the pivot is set relative to the head anchor, so the scarf sits at the jaw line and the glasses at the eye line of the master. Measure these offsets once from `art/bobee-master.png`.

- [ ] **Step 1: Write the failing test** in `test/lint-sprites.test.js`: `defaultFiles()` includes every `assets/props/*.png`. Also check that `anchors.json` has, for each strip, as many points as the strip has frames (width / 96), all inside 0–95.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Draw the props** in `make-props.js` using the same `Img` and palette helpers (move the shared helpers into `art/pixels.js` if `make-props.js` needs them). Each prop gets a 1 px dark outline, and nothing is partly transparent. Write `anchors.json` from `make-states.js`.
- [ ] **Step 4: Generate and lint.** Run `node art/make-props.js && node art/make-states.js assets/bobee preview.png && node scripts/lint-sprites.js`. Expected: all `ok`. Check a preview of `idle` frame 0 with each prop placed at its anchor (add `--preview-props out.png` to `make-props.js`).
- [ ] **Step 5: Commit** with the message `feat: outfit art and head anchors`.

### Task 14: Outfit calendar (`renderer/outfits.js`, pure part)

**Files:**
- Create: `renderer/outfits.js`
- Test: `test/outfits.test.js`

**Interfaces:**
- Produces:
  - `easterSunday(year: number) => Date`, using the anonymous Gregorian algorithm, at local midnight.
  - `OUTFIT_TABLE`: the spec's table as data, `[{ from: [m, d] | 'goodFriday', to: [m, d] | 'easterMonday', slot, prop, message }]`.
  - `outfitFor(date: Date) => { hat: string|null, neck: string|null, face: string|null, messages: string[] }`. Holiday rows win over season rows in the same slot. `messages` lists the message keys active on that date, holidays first.

- [ ] **Step 1: Write the failing tests.**
  - `easterSunday` gives 2025 → Apr 20, 2026 → Apr 5, 2027 → Mar 28, 2028 → Apr 16, 2029 → Apr 1 and 2030 → Apr 21.
  - `outfitFor(2026-12-10)` is `{ hat: 'santa-hat', neck: 'scarf', face: null }`, with messages `['christmas', 'winter']`.
  - Dec 31 gives `party-hat` and `scarf`. Jan 1 gives `party-hat`. Jan 2 gives no hat but the `scarf`.
  - In 2028 (a leap year), Feb 29 still has the `scarf` and Mar 1 doesn't. Feb 14 gives `heart-clip` and `scarf`.
  - Good Friday 2026 (Apr 3) and Easter Monday 2026 (Apr 6) give `bunny-ears`, overriding `flower-crown`. Apr 7 gives `flower-crown`.
  - Jul 1 gives `face: 'sunglasses'`. Oct 24 and Oct 31 give `pumpkin-hat`. Nov 1 gives nothing.
- [ ] **Step 2: Run** `npx vitest run test/outfits.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: outfit calendar with Easter`.

### Task 15: Draw outfits, tray toggle, holiday lines, and release 1.4.3

**Files:**
- Modify: `renderer/sprite.js`, `renderer/outfits.js` (drawing part), `renderer/app.js`, `main.js`, `README.md`, `package.json`
- Test: `test/sprite.test.js`

**Interfaces:**
- Consumes: `outfitFor` (Task 14), `anchors.json` and `props.json` (Task 13), the store's `outfits` and `said` fields (Task 1).
- Produces:
  - `SpritePlayer.setOverlay(fn | null)`. Inside `draw()`, after `drawImage` and inside the same save/restore (so mirroring applies), it calls `fn(ctx, { animation, frame: idx, dx, dy, scale })`.
  - `createOutfitLayer({ anchors, props, images }) => { set(outfit|null), draw(ctx, info), blush(on: boolean) }`. It draws each active slot's prop at `anchor - pivot`, scaled. It skips the `face` slot while the animation is `sleep`, `sleep-pet`, `sleep-peek` or `yawn`. It draws nothing for strips with no anchors (placeholders). `blush` draws the two 4×2 cheek rectangles in the master's blush colour, at fixed offsets from the head anchor, measured from the master.
  - Tray: a new `Outfits` checkbox, checked from `store.get().outfits`. Clicking it patches the store and calls `sendCommand('outfits-on' | 'outfits-off')`.

- [ ] **Step 1: Write the failing test** in `test/sprite.test.js`, using a fake canvas context that records calls: after `setOverlay(spy)` and `draw(t)`, the spy was called once with `frame` matching `frameIndex(...)`. `setOverlay(null)` stops the calls.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the overlay hook and the outfit layer.** In `app.js`:
  - Load `anchors.json`, `props.json` and the prop images with the existing `fetchText` and `Image` loading. If any of them fail, leave outfits off.
  - Set the outfit from `outfitFor(now())` on start, at each local midnight, and when the tray toggles it.
  - Blush is on while the level is `happy` or above and the animation is `idle`, on roughly 1 frame in 20.
- [ ] **Step 4: Holiday lines.** On `visit-start`, for the first key in `outfitFor(now()).messages` that isn't in `state.said` (when outfits are on), say `next(key)` and patch `said`. This comes after the morning line from Task 12, and only one of the two is said per visit.
- [ ] **Step 5: Run all tests.** Expected: PASS.
- [ ] **Step 6: Check in the app** with `BOBEE_DATE` set to `2026-12-10`, `2026-12-31`, `2026-04-05`, `2026-07-01` and `2026-10-30`. Each outfit sits right in every animation and facing, the sunglasses come off while he sleeps, and the Outfits toggle hides them.
- [ ] **Step 7: Release.** Set `"version": "1.4.3"`, add outfits and their dates to the README, and run `npm run dist`.
- [ ] **Step 8: Commit** with the message `feat: release v1.4.3, seasonal outfits`.

---

## Milestone 5 — 1.4.4 Treat jar

### Task 16: Jar logic (`lib/jar.js`)

**Files:**
- Create: `lib/jar.js`
- Test: `test/jar.test.js`

**Interfaces:**
- Produces (CommonJS):
  - `JAR_SIZE = 48`, `TREAT_SIZE = 32`, `TREATS = ['cookie', 'honey', 'berries']`, `JAR_TTL_MS = 300000`, `HIT_INSET = 12`, `MIN_GAP = 300`
  - `planJarTimes(day: Date, random) => Date[]`: 2 or 3 times (3 when `random() < 0.5`), each between 09:00 and 21:00 local time, sorted, at least 1 h apart
  - `pickTreats(random) => string[3]`
  - `jarX(workArea: { x, width }, bobee: { x, width }, random) => number | null`: a jar x within the work area, at least `MIN_GAP` from Bobee's window centre and outside the right-hand 300 px home zone. Returns `null` if no spot fits.
  - `hitBobee(point: { x, y }, bounds: { x, y, width, height }) => boolean`: true inside the bounds inset by `HIT_INSET` on every side
  - `createJarSession(treats: string[]) => { grab(): string|null, release(hit: boolean): { result: 'eaten'|'returned', treat: string, left: number }, cancel(): void, left(): number, active(): boolean }`. A grab takes the next treat. A miss or a cancel puts it back. `grab()` returns `null` while a treat is already held or the jar is empty.

- [ ] **Step 1: Write the failing tests.**
  - `planJarTimes(new Date(2026, 9, 25), seeded(3))` gives a length of 2 or 3, every time between 9:00 and 21:00, sorted, with gaps of at least 3600000 ms. Across seeds 1–20, both lengths come up.
  - `jarX({ x: 0, width: 1920 }, { x: 1720, width: 200 }, () => 0.5)` gives a result `r` with `Math.abs(r + 24 - 1820) >= 300` and `r + 48 <= 1920 - 300`. A 500 px wide work area gives `null`.
  - `hitBobee` is true at `{ x: 1820, y: 1000 }` for `{ x: 1720, y: 900, width: 200, height: 200 }`, false at `{ x: 1725, y: 1000 }` (inside the inset), and false outside.
  - Session: grab, `release(true)` gives `{ result: 'eaten', left: 2 }`. Grab, `release(false)` gives `{ result: 'returned', left: 2 }`. Grab, `cancel()` gives `left() === 2` and `active() === false`, then grab works again. After 3 eaten, `grab()` is `null`.
- [ ] **Step 2: Run** `npx vitest run test/jar.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: treat jar timing, placement and drag rules`.

### Task 17: Jar and treat art

**Files:**
- Modify: `art/make-props.js`
- Generated: `assets/props/jar.png` (48×48, honey jar with a lid), `assets/props/jar-open.png` (lid tilted, while being dragged from), `assets/props/cookie.png`, `assets/props/honey.png`, `assets/props/berries.png` (each 32×32)

- [ ] **Step 1: Draw them** with a 1 px dark outline in the master's palette (honey from the mug and muzzle colours).
- [ ] **Step 2: Lint.** Run `node art/make-props.js && node scripts/lint-sprites.js`. Expected: all `ok`.
- [ ] **Step 3: Commit** with the message `feat: treat jar and treat art`.

### Task 18: Jar windows, the drag loop, and release 1.4.4

**Files:**
- Create: `renderer/jar.html`, `renderer/jar.js`, `preload-jar.js`
- Modify: `main.js`, `preload.js`, `renderer/app.js`, `package.json` (`build.files` adds `"preload-jar.js"`; version), `README.md`

**Interfaces:**
- Consumes: everything in Task 16, the store's `jarsShown` (Task 1), `brain.wakeHere` and `brain.moment` (Task 3), `mood.add('treat')` (Task 8), `picker.next` (Task 9).
- Produces:
  - Main → Bobee: `'jar'` with `{ event: 'appear' | 'empty' | 'gone' }`, and `'treat-eaten'` with `{ treat }`.
  - Main → jar window: `'jar-state'` with `{ view: 'jar' | 'treat', treat?: string, fading?: boolean }`.
  - Jar window → main: `'jar-grab'`, `'jar-release'`, `'jar-click-through'` with `on: boolean`.
  - Preload for Bobee: `onJar(cb)` and `onTreatEaten(cb)`. `preload-jar.js` exposes `window.jar` with `grab()`, `release()`, `setClickThrough(on)` and `onState(cb)`.

- [ ] **Step 1: Schedule the jar in main.**
  - On start and at each local midnight, run `planJarTimes(today)`, skipping today's first `store.get().jarsShown` times.
  - Check once a minute. A time is due when it's passed, presence is `active` and Bobee isn't paused. Then create the jar window: a transparent, frameless, always-on-top (`'screen-saver'`), non-focusable 48×48 window at `jarX(...)`, sitting on the bottom of the work area like Bobee (`SINK`). It loads `bobee://app/renderer/jar.html`, with click-through forwarding as for Bobee.
  - Patch `jarsShown + 1` and send `'jar' { event: 'appear' }`.
  - If creating the jar or treat window throws, log `[bobee] jar unavailable:` with the message and skip that showing. The same applies to the treat window: cancel the session so the treat stays in the jar.
- [ ] **Step 2: Jar view.** `renderer/jar.js` draws `jar.png` (or the treat image when `view === 'treat'`) on a canvas, with the same opaque-pixel click-through test as `app.js`. On `pointerdown` over an opaque pixel it calls `setPointerCapture` and `window.jar.grab()`. `pointerup` and `lostpointercapture` both call `window.jar.release()`.
- [ ] **Step 3: The drag loop in main.**
  - On `'jar-grab'`: `session.grab()`. If it returns a treat, create a 32×32 treat window the same way, centred on `screen.getCursorScreenPoint()`, and move it to the cursor every 16 ms.
  - On `'jar-release'`: stop the loop and run `hitBobee(cursor, win.getBounds())`.
    - Hit: `session.release(true)`, close the treat window and send `'treat-eaten'`.
    - Miss: `session.release(false)`, animate the treat window back to the jar over 300 ms (move it in 10 steps), then close it.
  - After a release with `left === 0`: send `'jar' { event: 'empty' }` and fade the jar out (`setOpacity` to 0 over 1 s), then close it.
  - TTL: after `JAR_TTL_MS` with no grab in progress, fade and close, and send `'gone'`.
  - Pause, or presence turning `idle`: `session.cancel()`, close both windows at once, and send `'gone'`.
- [ ] **Step 4: Bobee's side** in `app.js`:
  - `'jar' appear`: if he isn't in `home` or `sleep`, say `next('treat')`.
  - `'treat-eaten'`:
    1. `brain.wakeHere()` if he's asleep.
    2. `brain.moment('munch', durationOf('munch', 1))`, then once it's done `brain.moment('happy', happyMs)`.
    3. Say `next('yum')`.
    4. `mood.add('treat')` and save the snapshot.
  - `'jar' empty`: say `next('full')` after the munch.
- [ ] **Step 5: Run all tests.** Expected: PASS.
- [ ] **Step 6: Check in the app.** Add a dev-only `BOBEE_JAR_NOW=1` env check in main that shows a jar 5 s after start when `!app.isPackaged`. Then check:
  - Dragging onto him plays munch, then happy and "yum!".
  - Dropping on the taskbar sends the treat back.
  - Alt-tabbing mid-drag sends the treat back.
  - After 3 treats he says "I'm so full!" and the jar fades.
  - Pause mid-drag closes everything.
  - Clicks pass through the jar's transparent corners.
- [ ] **Step 7: Release.** Set `"version": "1.4.4"`, add the treat jar to the README, run `npm run dist`, and confirm `preload-jar.js` and the props are in `app.asar` (`npx @electron/asar list dist/win-unpacked/resources/app.asar`).
- [ ] **Step 8: Commit** with the message `feat: release v1.4.4, the treat jar`.

---

## Running this in sessions

Milestones 2, 3 and 4 depend only on milestone 1. They all edit `renderer/app.js`, `renderer/sprite.js` and `art/make-states.js`, so run them one after another, not side by side. Milestone 5 needs `munch` (Task 10) and mood (Task 8). Suggested order: 1, 2, 3, 4, 5, with one session per milestone, each merged into `main` before the next one starts.
