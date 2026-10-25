# Bobee sprite overhaul

Goal: make Bobee cleaner, cuter and more animated. Features come after this.

## Where things stand

- All art comes from one 57x85 drawing, `art/bobee-base.png`.
- `art/make-states.js` builds every animation by editing that drawing pixel by pixel (moving steam, redrawing eyes, pasting legs). Most states have 2–4 frames.
- The app loads 96x96 frame strips from `assets/bobee/<state>.png` (states: idle, walk, sleep, drag, happy). It falls back to `assets/placeholder/`. Frame count comes from the strip width (`renderer/sprite.js`, `stripInfo`).

## Problems with the current art

- Walk frames have stray pixels at the hips, left over from the old body and legs after the new legs are pasted on.
- The outline is uneven: jagged on the right hip, and thin or missing in places on the left.
- The mug handle pokes out past the body.
- The heart in `happy` is cut off at the top of the frame.
- The walk is a sitting bear with legs pasted under it, so it doesn't read as walking.
- Too few frames, so motion looks choppy.

## Step 0 — you (before session A)

Install the SpriteCook plugin from the card in chat and finish any sign-in it asks for. Sessions A and B need it.

## Session A — clean master sprite (needs SpriteCook)

1. Use SpriteCook to redraw Bobee from `art/bobee-base.png` as a clean master. Keep him a round brown bear with pink cheeks, a tan muzzle and his coffee mug. Requirements: a crisp 1px dark outline all the way round, no stray pixels, both feet fully visible, fits inside 96x96 with at least 4px of space at the top for effects (hearts, Zs), and feet on the bottom row.
2. Also make a no-mug variant for states where his paws need to be free (wave, drag).
3. Add `scripts/lint-sprites.js` plus a test that checks every strip in `assets/bobee/`. It fails on: partly transparent pixels, single stray pixels, opaque pixels on the frame edge, frames that don't fit the 96px grid, and feet that aren't on the same ground row.
4. Save the masters as `art/bobee-master.png` and `art/bobee-master-nomug.png`. Show the user a zoomed preview and get their approval before finishing.

Done when: the user approves the master and the lint script passes on it.

## Session B — animation sets (after A, needs SpriteCook)

Use SpriteCook to animate from the approved master. Each state is a 96px-square strip:

| State | Frames | Motion |
|---|---|---|
| idle | 6–8 | breathing, blinks, steam rising |
| walk | 6–8 | real waddle with steps, mug held steady |
| sleep | 4–6 | slow breathing, drifting Zs, eyes closed |
| drag | 4 | dangling, legs kicking, surprised face |
| happy | 6 | little hop, eyes closed, heart floats up and stays in frame |
| wave *(new)* | 6 | paw wave, no mug |
| sip *(new)* | 6 | sips coffee, content face |
| yawn *(new)* | 6 | stretch and yawn |

- Clean up every strip until `scripts/lint-sprites.js` passes.
- Register the new states in `renderer/sprite.js`. Only change `NAMES` and `DEFAULT_FPS` there, and add matching placeholders. Set fps for smooth motion (about 8–10 for walk and happy).
- Keep `art/make-states.js` only if it's still used. Otherwise delete it and note in the README how the art is now made.
- Run `npm test`, launch the app and check each state.

Done when: every state passes the lint, the tests pass, and the user has seen them running in the app.

## Session C — motion polish in code (can run now, alongside A)

Add movement on top of the frames in `renderer/` without touching the art or `NAMES`/`DEFAULT_FPS` in `sprite.js`:

- squash and stretch when he lands after a drag or a hop
- walk speed eases in and out instead of starting and stopping at full speed
- a small bob while walking
- a little bounce when clicked, a wiggle on hover
- a gentle tilt while he's being dragged
- everything respects the reduced-motion setting, if the app has one

Add tests for any new pure helpers (easing, squash timing). Run `npm test` and check it in the app.

Done when: it feels smoother in the app and the tests pass.

## Order

Step 0, then A and C at the same time, then B once A is approved. Merge C and B to `main` separately. If both edit `renderer/sprite.js`, C keeps the motion code and B keeps the state list.
