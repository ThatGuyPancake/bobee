# Bobee

A tiny pixel-art bear who lives on your Windows desktop. He wanders along the bottom of your screen, naps, cheers when you type, and says kind things. Made with love as a gift.

Built with Electron 45 and plain JavaScript.

## Run it

```
npm install
npm start      # run Bobee from source
npm test       # run the test suite
npm run dist   # build the Windows installer -> dist/Bobee Setup.exe
```

Electron's install script has to be approved by npm. This is already set in `package.json` (`"allowScripts": { "electron@45.0.0": true }`). If you bump the Electron version, update that entry to match, or Electron's binary won't download.

Until you add your own art, Bobee uses the placeholder sprites in `assets/placeholder/`.

## Adding art

Drop PNGs into `assets/bobee/`. Any missing animation falls back to its placeholder.

- Files: `idle.png`, `walk.png`, `sleep.png`, `drag.png`, `happy.png`
- Each frame is **64x64 px**; frames sit side by side in one **horizontal strip** (so a 4-frame animation is 256x64). A width that isn't a multiple of 64 is treated as a single frame.
- Draw Bobee **facing right**; the app flips him when he walks left.
- Put his **feet 4 px above the bottom** of the frame so he stands on the taskbar nicely.

Optional `assets/bobee/sprites.json` sets frames per second per animation. Anything you leave out uses the default:

```json
{
  "fps": { "idle": 2, "walk": 8, "sleep": 2, "drag": 1, "happy": 4 }
}
```

(A bare `{ "walk": 8 }` without the `fps` wrapper works too.)

## Editing messages

`messages.json` in the project root has two lists of speech-bubble text:

```json
{
  "random": ["drink some water 💧", "you've got this 💛"],
  "click": ["hehe, hi! 🐝", "boop!"]
}
```

- `random`: said every so often on their own.
- `click`: said when you click Bobee. If `click` is missing or empty, `random` is used.

Each list must be a non-empty array of non-empty strings, otherwise the built-in defaults are used (same for invalid JSON). Emoji are welcome. Rebuild with `npm run dist` to ship changes.

## Uninstalling

Use Windows Settings > Apps > Installed apps > Bobee > Uninstall, or run the uninstaller from `%LOCALAPPDATA%\Programs\bobee`.

In the installed app, Bobee is set to start with Windows the first time it runs. You can turn that off any time from the tray icon menu: untick **Start with Windows**. The same menu has Pause/Resume, Say something and Quit.
