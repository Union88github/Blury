# Mote

A small circle that floats on top of your other windows. Drag it where you want and it
snaps to the nearest screen edge. Click it and a menu fans out around it with a screenshot
tool and a notepad.

It's a native Windows binary built with Tauri, not a bundled copy of Chrome, so the
download is small and there's no runtime to install alongside it.

![demo](docs/demo.gif)

## Download

[Get the installer from Releases](../../releases/latest)

Run it and Mote appears in your system tray.

### Windows will warn you the first time

The installer isn't signed, so SmartScreen shows "Windows protected your PC" when you run
it. Every unsigned binary gets this. A code signing certificate costs a few hundred dollars
a year, which is not something a free project carries. Click More info, then Run anyway.

If you'd rather not, build it yourself. Instructions are at the bottom.

## What it does

Drag the bubble and it throws with momentum, then springs to whichever edge is closest. It
remembers where you left it between restarts.

Click it and the tools fan out in an arc around it. The arc turns to face inward when the
bubble is near an edge or sitting in a corner, so it never opens off the screen.

The screenshot tool freezes every monitor. Drag a box around what you want and the result
goes to your clipboard and to a PNG in `Pictures\Mote\`. Each screen is captured in its own
pixels, so setups with different scaling per monitor crop where you expect.

The notepad opens beside the bubble. Plain text, saves as you type, still there next time.

A global hotkey brings the bubble to your cursor from anywhere. The tray icon hides it or
quits it. It can start with Windows, though that's off unless you turn it on.

Clicks pass through everywhere except the bubble itself, so it never blocks what's
underneath it.

## Controls

| Action | Control |
| --- | --- |
| Summon the bubble to your cursor | `Ctrl` + `Shift` + `Space` |
| Open the radial menu | Click the bubble |
| Close the menu or a panel | `Esc`, or click outside it |
| Move the bubble | Drag it, release to snap to the nearest edge |
| Select a screenshot region | Drag on the frozen screen |
| Cancel a screenshot | `Esc`, or click without dragging |
| Show/hide, settings, quit | Right-click the tray icon |

To change the hotkey, right-click the tray icon and open Settings. Type a new combination,
`Alt+Space` for instance, and press Save. If another application already owns it, Mote says
so and keeps the old one rather than leaving you with nothing bound.

Settings live in `%APPDATA%\Mote\config.json` and notes in `%APPDATA%\Mote\notes.json`.

## Limitations

A screenshot selection can't span two monitors. Mote puts a separate overlay on each screen
so that different scaling factors crop correctly, and that's the cost of doing it that way.

The multi-monitor path is written to work in each screen's own pixels but has only ever run
on a single display, so treat it as untested.

Notes are one buffer. No tabs, no multiple notes.

Windows only. It calls Win32 directly and won't run on macOS or Linux.

## Requirements

Windows 10 version 1803 or later, or Windows 11, 64-bit.

You also need the WebView2 runtime, which ships with Windows 11 and current Windows 10. If
it's missing the installer fetches it, or you can install it yourself:

```
winget install --id Microsoft.EdgeWebView2Runtime -e
```

## Build from source

You need [Node.js](https://nodejs.org/) 18 or later, [Rust](https://rustup.rs/) on the
stable MSVC toolchain, and the Visual Studio C++ build tools that rustup asks for.

```bash
git clone https://github.com/Union88github/Mote.git
cd Mote/app
npm install
npm run tauri build
```

The installer ends up in `app/src-tauri/target/release/bundle/nsis/`, and a standalone
`mote.exe` in `app/src-tauri/target/release/` if you'd rather not install anything.

The first build compiles the entire Rust dependency tree and takes a while. Later ones are
much quicker.

To run it in development with hot reload:

```bash
npm run tauri dev
```

To run the tests:

```bash
npm test
```

## License

MIT. See [LICENSE](LICENSE).
