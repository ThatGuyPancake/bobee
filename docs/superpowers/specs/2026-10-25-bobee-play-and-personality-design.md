# Bobee — Play & Personality Design

Date: 2026-10-25

## Purpose

Bobee is a gift: a pixel-art bear on her Windows desktop. This round makes him feel like he lives there and is fun to spend time with. He stays on screen all the time, likes being petted, enjoys treats, has a gentle daily rhythm and mood, and dresses up for the seasons.

Success means:
- He's always there but never in the way: asleep in a corner most of the time, never blocking clicks, never needy.
- She notices new things over days and weeks (moods, rhythm, outfits) without having to set anything up.
- Everything stays offline. His state is saved only on her PC.

This is the first of three feature projects. The other two get their own specs later: **Caring helper** (reminders and a focus timer) and **Bobee Link** (remote messages and doodles).

## Decisions made with the user

- Bobee no longer leaves the screen. He sleeps in the bottom-right corner between visits.
- About 10 minutes an hour of visits stays as now. The rest of the time he's napping at home.
- Treats come from a jar that appears now and then. She drags a treat from the jar onto him.
- All four play features are in: petting, treats, moods and daily rhythm, seasonal outfits.
- All new art is drawn in code from `art/bobee-master.png`, like the existing strips. No AI art.

## Assumptions

- She's in Germany: dates and holidays follow the German calendar, using her local clock.
- Birthdays and anniversaries are out of scope (that was the "special days" option, not chosen).
- He never gets sad, sulks or asks for attention. Happiness only ever goes up, then settles back to normal.

## 1. Always on screen

- **Home.** The `away` state is replaced by `home`: Bobee asleep in the bottom-right corner of the main display's work area, feet on the taskbar edge like now. He uses the existing `sleep` strip (eyes shut, Zs, slow breathing from `motion.js`).
- **Visits.** The visit plan is unchanged: `VISITS_PER_HOUR` evenly spaced visits with the same budget of about 10 minutes an hour. A visit now goes like this:
  1. He's asleep at home.
  2. He plays `yawn` and wakes.
  3. He plays `wave`.
  4. He wanders, idles, sips and chats as today.
  5. When the visit is over, he walks back to the home spot.
  6. He plays `yawn` and goes back to `sleep`.
- **Waking in place.** A click, a treat drop, or "Say something" from the tray wakes him where he is. He reacts, stays awake for `NAP_WAKE_MS` (60 s), then goes back to sleep. If he's away from home at that point, he walks home first. A click doesn't start a full visit. "Say something" keeps its current short visit (`SUMMON_MS`).
- **Idle or locked PC.** He stays asleep at home and visits wait. When she comes back, the next due visit starts.
- **Pause.** The tray's Pause still hides him completely, and Resume brings him back asleep at home.
- **Dragged away.** If she drops him elsewhere, he stays there until his next sleep, then walks home before lying down.
- **Night (0–6).** No visits (see section 3).

## 2. Petting

- **Detection.** His window already receives forwarded mouse moves without blocking clicks (`setIgnoreMouseEvents(true, { forward: true })`). `renderer/petting.js` keeps the last 1.5 s of pointer positions over his opaque pixels. It reports a **pet** when the horizontal direction changes at least 3 times, each stroke covers at least 6 px, and no mouse button is held.
- **Cooldown.** `PET_COOLDOWN_MS` is 4 s between pet reactions.
- **Awake reaction.** He plays the new `pet` strip (6 frames): eyes closed, cheeks blushing, leaning towards the stroke direction, and 1–2 small hearts.
- **Asleep reaction.** He plays the new `sleep-pet` strip (4 frames): a smile in his sleep, a little wiggle and one heart. He doesn't wake.
- **Mood.** Each pet adds +2 happiness (section 3).

## 3. Moods and daily rhythm

### Happiness

- `renderer/mood.js` tracks happiness on a 0–100 scale, with a resting level of **60**.
- **What raises it:** pet +2, click +1, treat +8. It's capped at 100.
- **Settling back:** above 60, it drifts back down with a 3-hour half-life, worked out from the elapsed time on each tick and on startup. It never drops below 60.

| Level | Range | Effect |
|---|---|---|
| content | < 75 | today's behaviour |
| happy | 75–89 | `happy` plays more often on visits, occasional blush while idle (a 1-frame overlay), and the `sweet` message group gets double weight |
| overjoyed | ≥ 90 | as happy, plus he waves and hops unprompted now and then, with extra hearts |

### Daily rhythm (local time)

| Phase | Hours | Behaviour |
|---|---|---|
| morning | 6–11 | first visit of the day says a `morning` line; `sip` comes up twice as often |
| lunch | 12–14 | one visit per day includes a snack: `munch` strip, no jar, and a `lunch` line |
| day | 11–12, 14–20 | normal |
| evening | 20–24 | `yawn` comes up more often, visits are 30% shorter, `evening` lines |
| night | 0–6 | no visits; a click shows the `sleep-peek` strip (one eye opens, then closes again) |

- New message groups in `messages.json`: `morning`, `lunch`, `evening`, plus one key per holiday (section 4).
- Missing groups fall back to built-in defaults, the same way the current groups do.

## 4. Seasonal outfits

- **One hat and one neck item** at a time. A holiday outfit wins over the plain seasonal one in the same slot.
- **How they're drawn.** Each outfit piece is drawn once, facing right, by `art/make-props.js`. At runtime `renderer/outfits.js` draws it on top of the current frame at that frame's head position. The positions come from `assets/bobee/anchors.json`, which `make-states.js` writes alongside the strips (one head point per frame per strip). When Bobee faces left, the outfit flips with him.

| Dates (inclusive) | Slot | Outfit | Message key |
|---|---|---|---|
| Dec 1 – Feb 28/29 | neck | red knitted scarf | `winter` |
| Dec 1 – Dec 26 | hat | Santa hat | `christmas` |
| Dec 31 – Jan 1 | hat | party hat + small confetti | `newyear` |
| Feb 14 | hat | heart clip | `valentine` |
| Good Friday – Easter Monday | hat | bunny ears | `easter` |
| Mar 20 – May 31 | hat | flower crown | `spring` |
| Jun 21 – Aug 31 | face | sunglasses (only while awake) | `summer` |
| Oct 24 – Oct 31 | hat | pumpkin hat | `halloween` |

- **Easter.** The date is worked out each year (anonymous Gregorian algorithm).
- **Holiday lines.** At most one per holiday per day, on the first visit of the day.
- **Tray setting.** A new **Outfits** checkbox, on by default, turns outfits and holiday lines off. The setting is saved.
- **Changing dates.** All dates live in one table in `renderer/outfits.js`.

## 5. Treat jar

- **When it appears.** 2–3 times a day, at random times between 9:00 and 21:00, and only while she's active (presence `active`) and Bobee isn't paused.
- **Where.** The jar is a 48×48 honey-jar sprite in its own small window. It sits on the bottom edge of the work area, at least 300 px from Bobee and not in the home corner.
- **Contents.** It holds 3 treats each time, drawn at random from cookie, honey pot and berries.
- **Bobee notices.** If he's awake when it appears, he says one line from `treat` ("ooh, snacks? 🍯"). If he's asleep, nothing happens.
- **Dragging.**
  1. On mousedown on the jar, main opens a 32×32 treat window under the cursor.
  2. While the button is held, the jar window keeps mouse capture, and main moves the treat window to the cursor on each move (polling `screen.getCursorScreenPoint()` at 60 Hz as a fallback).
  3. On release, `lib/jar.js` checks whether the cursor point is inside Bobee's window bounds, inset by 12 px to match his body.
- **Hit.**
  1. The treat is consumed.
  2. Bobee wakes if he's asleep and plays `munch` (6 frames: chewing, crumbs).
  3. He then plays `happy` and says a line from `yum`.
  4. Happiness goes up by +8.
- **Miss.** The treat window animates back to the jar over 300 ms and the treat stays in the jar.
- **Going away.**
  - When all 3 treats are eaten, he says a line from `full` ("I'm so full! 🐻") and the jar fades out over 1 s.
  - If it's left alone, it fades after 5 minutes with no comment.
  - If she goes idle or Pause is pressed, it fades right away.
- **Click-through.** The jar and treat windows use the same forwarded click-through as Bobee's window, so only their opaque pixels catch the mouse.

## Architecture

New modules. The ones marked *pure* have no Electron or DOM access and are unit-tested:

| Module | Job |
|---|---|
| `renderer/visits.js` | the visit plan, moved out of `brain.js` (pure) |
| `renderer/petting.js` | pointer samples to `pet` events (pure) |
| `renderer/mood.js` | happiness, settling back, levels, day phase from a `Date` (pure) |
| `renderer/outfits.js` | `outfitFor(date)` and the Easter date (pure); `drawOutfit(ctx, frameAnchor, facing)` |
| `lib/jar.js` | jar schedule, treat picks, drop hit test (pure) |
| `lib/store.js` | loads and saves `bobee-state.json` in `app.getPath('userData')` |
| `renderer/jar.html` + `renderer/jar.js` | jar and treat window views |

Changes to existing code:

- `renderer/brain.js`: the `away` state becomes `home`; adds wake-in-place, walk-home and night rules; uses `visits.js`, `mood.js` and `petting.js`.
- `renderer/app.js`: wires up petting, mood, outfits and treat events; sends happiness changes to main for saving.
- `renderer/sprite.js`: registers `pet`, `sleep-pet`, `sleep-peek`, `munch`; adds an overlay hook for outfits and blush.
- `main.js`: jar and treat windows, the drag loop, the Outfits tray item, a `treat-eaten` IPC message to Bobee's window, and `store.js` load/save.
- `preload.js`: exposes the new IPC channels.
- `art/make-states.js`: the new strips plus `anchors.json`. The new `art/make-props.js` draws the jar, the treats and the outfit pieces into `assets/props/`.
- `scripts/lint-sprites.js`: also checks `assets/props/` (no partly transparent pixels, no stray pixels, nothing touching the edge).
- `messages.json`: adds the new groups: `morning`, `lunch`, `evening`, `treat`, `yum`, `full`, and the holiday keys.

### Saved state

`bobee-state.json`:

```json
{
  "version": 1,
  "happiness": 60,
  "updatedAt": "2026-10-25T10:00:00.000Z",
  "day": "2026-10-25",
  "jarsShown": 1,
  "lunchSnack": false,
  "said": ["morning", "halloween"],
  "outfits": true
}
```

- Writes go to a temporary file that's then renamed over the real one. Saves are batched to at most once every 10 s, plus once on quit.
- A missing or broken file means defaults. Fields that belong to the day are reset when `day` changes.
- Nothing in this file leaves the PC.

## Error handling

- **Art.** A missing strip falls back to placeholders as now. A missing outfit or prop image means it's simply not drawn, with no crash. A missing `anchors.json` turns outfits off.
- **Jar.** If the jar or treat window can't be created, that jar showing is skipped and logged.
- **Saving.** If the state file can't be written, Bobee keeps going with what's in memory and logs a warning.
- **Clock.** If the clock jumps (sleep or resume, time-zone change), settling back uses the real elapsed time, capped at 24 h, and the day phase is recomputed.

## Testing

- **Unit tests (vitest):**
  - petting: gesture thresholds and cooldown
  - mood: rises, settling back, never below 60, the levels, the day phase at every boundary
  - outfits: the calendar, including leap years and overlapping holiday and season, and Easter for 2025–2030
  - jar: time windows, distance from Bobee, the hit test with its inset
  - store: broken file, day rollover
  - visits: the plan, matching current behaviour
- **Brain tests:** the full sleep, wake, visit, walk home and sleep cycle; wake-in-place; no visits at night; idle keeps him home.
- **Sprite lint** on all new strips and props.
- **Check in the running app** for each build step: petting while awake and asleep, a drag that hits and one that misses, outfits forced by a debug date (the `BOBEE_DATE` environment variable, dev builds only), and the home corner on her screen size.

## Build order

Each step is shippable on its own:

1. **1.4.0 Always on screen:** home corner, wake-in-place, night, the `visits.js` split, `store.js`.
2. **1.4.1 Petting:** `petting.js`, the `pet` and `sleep-pet` strips.
3. **1.4.2 Moods and rhythm:** `mood.js`, the day phases, the `sleep-peek` and `munch` strips, the new message groups.
4. **1.4.3 Outfits:** `make-props.js` outfit pieces, `anchors.json`, `outfits.js`, the tray toggle.
5. **1.4.4 Treat jar:** `jar.js`, the jar and treat windows, the drag loop, the jar and treat art.

Steps 2, 3 and 4 depend only on step 1. Step 5 needs `munch` from step 3.

## Not in scope

- Reminders and focus timer (Caring helper), and remote features (Bobee Link): separate specs.
- Birthdays and anniversaries.
- A settings window: the tray menu is enough for now.
- Moving between screens: home is always the main display.
