Blury is a floating always-on-top circle for Windows. Drag it anywhere, it snaps to the
nearest screen edge, and clicking it opens a radial menu of tools.

## What's in it

- **Draggable bubble** with momentum. Throw it and it springs to the nearest edge, and it
  remembers where it was across restarts.
- **Radial menu** that turns to face inward near a screen edge or corner, so it never
  opens off-screen.
- **Screenshot** — freezes every monitor, drag a region, and the result is saved to
  `Pictures\Blury\` and copied to your clipboard.
- **Notes** — a plain-text pad beside the bubble that autosaves as you type.
- **Global hotkey** (`Ctrl+Shift+Space` by default) to summon the bubble to your cursor.
- **Tray icon** with Show/Hide, Settings and Quit.
- **Start with Windows**, optional and off by default.

## Installing

Download the `.exe` installer below and run it. It installs for the current user only, so
there is no UAC prompt.

**Windows will warn you on first run.** The installer is unsigned, so SmartScreen shows
"Windows protected your PC". Click **More info**, then **Run anyway**. A code-signing
certificate costs a few hundred dollars a year, which is not something a free project
carries. The source is public if you would rather build it yourself.

Requires Windows 10 (1803+) or Windows 11, 64-bit. The WebView2 runtime ships with current
Windows; if it is missing, the installer fetches it.

## Known limitations

- **A screenshot selection cannot span two monitors.** Blury puts one overlay on each
  screen so that mixed-DPI setups crop correctly, and that is the trade-off.
- **Mixed-DPI multi-monitor capture is untested on real hardware.** The code works in each
  monitor's own physical pixels, but it has only been exercised on a single display.
- **The `prefers-reduced-motion` path is implemented but untested.**
- **Notes hold a single buffer.** There are no multiple notes or tabs.
- Blury is Windows-only. It calls Win32 directly and will not run on macOS or Linux.

## Uninstalling

Add or Remove Programs → Blury. Settings and notes live in `%APPDATA%\Blury\` and are left
behind; delete that folder if you want them gone too.
