# Bobee

A tiny pixel-art bear who lives on your Windows desktop. He naps in the bottom-right corner, wakes up now and then to wander along the bottom of your screen, cheers when you type, and says kind things. Made with love as a gift.

## What he does

- **Home.** Most of the time Bobee is asleep in the bottom-right corner of the main screen, feet on the taskbar. He never blocks clicks: only his own pixels catch the mouse.
- **Visits.** About six times an hour he wakes up with a yawn, waves, wanders, sips his coffee and says something now and then. That adds up to about 10 minutes an hour. When the visit is over he walks back to the corner, yawns and goes back to sleep.
- **Waking him.** Click him and he wakes up right where he is, stays up for a minute, then walks home and dozes off. Clicking him on his way home wakes him again. You can drag him anywhere; after a minute he walks back home.
- **Petting.** Move the mouse back and forth over him a few times and he blushes, leans into it and little hearts float up. If he's asleep he smiles in his sleep and sleeps on. He can be petted again after a few seconds.
- **Say something** (tray menu) wakes him for a short visit with a wave.
- **Away from the PC.** While the screen is idle or locked he stays asleep at home, and visits wait until you're back.
- **Night (0:00 to 6:00).** No visits. He stays asleep.
- **Pause** (tray menu) hides him completely. Resume brings him back asleep in his corner.

His saved state (just a few counters and settings for now) lives in `bobee-state.json` in the app's data folder on this PC, and never leaves it.

Built with Electron 45 and plain JavaScript.

## Run it

```
npm install
npm start      # run Bobee from source
npm test       # run the test suite
npm run dist   # build the Windows installer -> dist/Bobee Setup.exe
```

Electron's install script has to be approved by npm. This is already set in `package.json` (`"allowScripts": { "electron@45.0.0": true }`). If you bump the Electron version, update that entry to match, or Electron's binary won't download.

To try a different time of day in a dev build, set `BOBEE_DATE` before starting, for example `BOBEE_DATE=2026-10-25T02:00 npm start`. The clock starts at that time and runs on normally. Installed builds ignore it.

Any animation missing from `assets/bobee/` falls back to the simple placeholder bear in `assets/placeholder/` (`npm run placeholders` redraws those).

## How the art is made

All of Bobee's animations are drawn in code from one picture, so they always match him exactly. No AI art tools are used.

- `art/bobee-master.png` is the master: the original drawing of Bobee with his edges cleaned, in a 96x96 frame with his feet on the bottom row.
- `node art/make-states.js` builds every strip in `assets/bobee/` from it. Each frame moves parts of the master by whole pixels (head, mug, feet) or redraws them in the master's own colours (eyes, mouths, paws, legs, steam, Zs, heart). Then `art/clean-edges.js` shaves the outer edge so he keeps one clean dark outline. Pass a file name as the second argument to also get a 4x preview on green: `node art/make-states.js assets/bobee preview.png`.
- `node scripts/lint-sprites.js` checks every strip for stray pixels, soft edges and feet that drift off the ground row. The test suite runs it too.

The animations:

| Strip | Frames | What happens |
| --- | --- | --- |
| `idle` | 8 | steam rises from his mug, a blink |
| `walk` | 8 | a waddle on two little legs, weight shifting from foot to foot |
| `sleep` | 6 | eyes shut, a little snore, Zs drifting up |
| `drag` | 4 | legs dangling and kicking, surprised face, a sweat drop |
| `happy` | 6 | a little hop with ^ ^ eyes and a heart floating up |
| `wave` | 6 | holds the mug in one paw and waves hello with the other (when he wakes for a visit, or from the tray's Say something) |
| `sip` | 6 | lifts the mug and sips, eyes closed (now and then while idle) |
| `yawn` | 6 | stretches tall with a big yawn (when he wakes up for a visit, and before he falls asleep) |
| `pet` | 6 | eyes closed and blushing, leans into the stroke, hearts float up (when you pet him while he's awake) |
| `sleep-pet` | 4 | smiles in his sleep with a little wiggle and one heart, without waking (when you pet him while he's asleep) |

Breathing, squash and stretch, the walk bob, the hover wiggle and the drag tilt are added on top in code by `renderer/motion.js`, so the frames themselves keep his body still.

### Strip format

- Frames are square and sit side by side in one horizontal strip; the strip's height is the frame size (96 px for Bobee, so an 8-frame strip is 768x96). A width that isn't a multiple of the height is treated as a single frame.
- Draw Bobee facing right; the app flips him when he walks left.
- Feet on the bottom row, and keep the top 4 rows free.

`assets/bobee/sprites.json` sets frames per second per animation. Anything you leave out uses the default:

```json
{
  "fps": { "idle": 4, "walk": 9, "sleep": 2, "drag": 8, "happy": 9, "wave": 8, "sip": 5, "yawn": 5, "pet": 7, "sleep-pet": 4 }
}
```

(A bare `{ "walk": 8 }` without the `fps` wrapper works too.)

## Editing messages

`messages.json` in the project root holds everything Bobee says:

```json
{
  "sweet": ["I love you ❤️", "You better stay hydrated 💧"],
  "jokes": [["Why did the chicken cross the road?", "To get to the other side! 🐔"]],
  "facts": ["Octopuses have three hearts 🐙"],
  "click": ["hehe, hi! 🐻", "boop!"]
}
```

- `sweet`, `jokes`, `facts`: said every so often while he's visiting. Each time, a group is picked at random first, so a long list doesn't crowd out a short one.
- `click`: said when you click Bobee. If it's missing, he picks from the other three.
- A message in `[ ]` brackets is shown as separate bubbles a few seconds apart, which is how jokes get a setup and a punchline. A plain `"text"` is one bubble.

If the file is broken (a missing comma, say), the built-in defaults are used. Emoji are welcome. Rebuild with `npm run dist` to ship changes.

## Uninstalling

Use Windows Settings > Apps > Installed apps > Bobee > Uninstall, or run the uninstaller from `%LOCALAPPDATA%\Programs\bobee`.

In the installed app, Bobee is set to start with Windows the first time it runs. You can turn that off any time from the tray icon menu: untick **Start with Windows**. The same menu has Pause/Resume, Say something and Quit.
