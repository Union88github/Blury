Mote is a small circle that floats on top of your other windows. Drag it where you want and
it snaps to the nearest screen edge. Click it and a menu fans out around it with a
screenshot tool and a notepad.

It's a native Windows binary built with Tauri rather than a bundled browser, so the
download is small and there's no runtime to install alongside it.

> **This was called Blury in 1.0.0.** Same application, renamed. If you installed 1.0.0,
> uninstall "Blury" from Add or Remove Programs first, because the rename changes the
> install identity and otherwise the two sit side by side. Settings and notes moved from
> `%APPDATA%\Blury\` to `%APPDATA%\Mote\`; copy that folder across if you want to keep
> them. Nothing else changed.

## What's in it

Drag the bubble and it throws with momentum, then springs to the nearest edge and remembers
where you left it.

Click it and the tools fan out in an arc that turns to face inward near an edge or corner,
so it never opens off the screen.

The screenshot tool freezes every monitor, you drag a box, and the result goes to your
clipboard and to a PNG in `Pictures\Mote\`.

The notepad opens beside the bubble and saves as you type.

There's a global hotkey (`Ctrl+Shift+Space` by default) to summon the bubble to your cursor,
a tray icon for hiding and quitting, and an optional start-with-Windows setting that's off
by default.

## Installing

Download the installer below and run it. It installs for the current user, so there's no
UAC prompt.

Windows will warn you the first time. The installer isn't signed, so SmartScreen shows
"Windows protected your PC". Click More info, then Run anyway. A code signing certificate
costs a few hundred dollars a year, which is not something a free project carries. The
source is public if you'd rather build it yourself.

Needs Windows 10 version 1803 or later, or Windows 11, 64-bit. The WebView2 runtime ships
with current Windows, and the installer fetches it if it's missing.

## Known limitations

A screenshot selection can't span two monitors. Mote puts a separate overlay on each screen
so that different scaling factors crop correctly, and that's the cost of doing it that way.

The multi-monitor path is written to work in each screen's own pixels but has only ever run
on a single display. Treat it as untested.

The `prefers-reduced-motion` path is implemented but also untested.

Notes are one buffer. No tabs, no multiple notes.

Windows only. It calls Win32 directly and won't run on macOS or Linux.

## Uninstalling

Add or Remove Programs, then Mote. Settings and notes stay in `%APPDATA%\Mote\`; delete
that folder too if you want them gone.
