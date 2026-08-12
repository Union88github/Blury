# Blury

A floating always-on-top circle for Windows. Drag it anywhere, it snaps to the nearest
screen edge, and clicking it opens a radial menu of tools — a region screenshot and a
notes pad.

![demo](docs/demo.gif)

## Download

**[Download the latest installer from Releases](../../releases/latest)**

Grab the `.exe` installer, run it, and Blury starts in your system tray.

### First run: Windows will warn you

The installer is unsigned, so Windows SmartScreen shows **"Windows protected your PC"**
the first time you run it. This happens to every unsigned binary — a code-signing
certificate costs a few hundred dollars a year, and this is a free project. To run it
anyway: click **More info**, then **Run anyway**.

If you would rather not, [build it from source](#build-from-source) — the result is the
same binary.

## Features

- **Draggable bubble** — throw it and it carries momentum, then springs to the nearest
  screen edge and stays there across restarts.
- **Radial menu** — click the bubble to fan the tools out around it. The arc turns to face
  inward when the bubble is near an edge or in a corner, so it never opens off-screen.
- **Screenshot** — freezes every monitor, then drag a region. The result is saved to
  `Pictures\Blury\` and copied to your clipboard. Works per-monitor, so mixed-DPI setups
  crop correctly.
- **Notes** — a plain-text pad anchored beside the bubble. Autosaves as you type and
  persists across restarts.
- **Global hotkey** — summon the bubble to your cursor from anywhere.
- **Tray icon** — Show/Hide, Settings, Quit.
- **Start with Windows** — optional, off by default.
- **Click-through** — the window only accepts clicks on the bubble itself; everywhere else
  passes through to whatever is behind it.

## Controls

| Action | Control |
| --- | --- |
| Summon the bubble to your cursor | `Ctrl` + `Shift` + `Space` |
| Open the radial menu | Click the bubble |
| Close the menu or a panel | `Esc`, or click outside it |
| Move the bubble | Drag it — release to snap to the nearest edge |
| Select a screenshot region | Drag on the frozen screen |
| Cancel a screenshot | `Esc`, or click without dragging |
| Show/hide, settings, quit | Right-click the tray icon |

To change the summon hotkey, right-click the tray icon → **Settings**. Type a new
combination (for example `Alt+Space`) and press **Save**. If another application already
owns that combination, Blury tells you and keeps the previous one.

Settings live in `%APPDATA%\Blury\config.json`, notes in `%APPDATA%\Blury\notes.json`.

## Requirements

- **Windows 10 (1803 or later) or Windows 11**, 64-bit.
- **WebView2 runtime.** Ships with Windows 11 and current Windows 10; if it is missing, the
  installer fetches it. To install it manually:
  `winget install --id Microsoft.EdgeWebView2Runtime -e`

There is no .NET, Electron, or Visual C++ redistributable to install.

## Build from source

You need [Node.js](https://nodejs.org/) 18+, [Rust](https://rustup.rs/) (stable, MSVC
toolchain), and the Visual Studio C++ build tools that `rustup` prompts for on Windows.

```bash
git clone https://github.com/Union88github/Blury.git
cd Blury/bubble
npm install
npm run tauri build
```

The installer lands at
`bubble/src-tauri/target/release/bundle/nsis/Blury_1.0.0_x64-setup.exe` (~1.4 MB). A
standalone `blury.exe` is also produced in `bubble/src-tauri/target/release/`, if you would
rather not install anything.

The first build compiles the whole Rust dependency tree and takes roughly 20 minutes;
later builds are far quicker.

### Changing the icon

`icons/source.png` is the 1024px master. Regenerate every size from it with:

```bash
npx tauri icon src-tauri/icons/source.png
```

Then **clean the crate before rebuilding**:

```bash
cd src-tauri && cargo clean -p blury && cd .. && npm run tauri build
```

Cargo caches the compiled Windows resource that carries the icon, and replacing the `.ico`
alone does not invalidate it — an incremental build will happily embed the *previous*
icon while every file on disk looks correct. CI builds from a clean checkout and is not
affected.

To run it in development instead, with hot reload:

```bash
npm run tauri dev
```

To run the test suite:

```bash
npm test
```

## License

MIT — see [LICENSE](LICENSE).
