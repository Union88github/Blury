# Launch copy

Drafts to copy from. Not published, not linked from the README.

Every version leads with the size, because that is the one claim that separates this from
the other floating-widget apps. Every version is also honest about what is untested — the
mixed-DPI capture path in particular. If someone on HN finds a limitation you hid, that is
the whole thread.

Before posting anywhere, check: the repo name, the download link, and the demo GIF all
render for a logged-out visitor.

---

## 1. Show HN

**Title** (65 characters, HN's limit is 80):

```
Show HN: Mote – a 1.4 MB floating bubble for Windows, no Electron
```

Alternatives:

```
Show HN: A 1.4 MB Windows desktop bubble with a radial menu (no Electron)
```

```
Show HN: Mote – tiny always-on-top bubble for Windows with a radial menu
```

**First comment**, posted as the author immediately after submitting:

```
I wanted a screenshot tool and a scratchpad reachable without alt-tabbing, and every
floating-widget app I found was a 150 MB Electron build idling at 300 MB of RAM. So I
wrote one in Tauri. The installer is 1.4 MB and it sits at about 25 MB of RAM.

It's a circle that floats on top of everything. Drag it and it throws with momentum and
snaps to the nearest screen edge. Click it and a radial menu fans out with two tools: a
region screenshot that copies to the clipboard and saves a PNG, and a plain-text notes
pad that autosaves.

Two things were more interesting than expected:

The radial menu breaks the moment the bubble is near a screen edge, which is where it
lives most of the time. So the arc computes which edges are blocking and turns to face
inward — 160 degrees against one edge, 100 in a corner, fanned around the summed inward
normals. It's a pure function with unit tests, which is the only reason I trust it.

Screen capture with multiple monitors at different DPI scaling is where these tools
usually ship broken. Mote captures every monitor first, then puts a separate overlay
window on each one, so each is cropped in its own physical pixels. The cost is that a
selection can't span two monitors. I should be straight about this: I have one display,
so the mixed-DPI path is written carefully but has never actually run on mixed-DPI
hardware. If you have that setup I'd like to know what happens.

Other things it doesn't do: notes are a single buffer, there's no cloud anything, no
telemetry, no auto-update, and it's Windows-only because it calls Win32 directly. The
binary is unsigned, so SmartScreen will warn you on first run — a certificate is a few
hundred dollars a year and this is free.

Source is MIT.
```

---

## 2. r/tauri

**Title:**

```
Built a floating desktop bubble in Tauri — 1.4 MB installer, and two problems that were harder than I expected
```

**Body:**

```
Mote is an always-on-top circle for Windows: drag it, it snaps to a screen edge, click it
and a radial menu fans out with a screenshot tool and a notes pad. Tauri v2, React
frontend, Win32 called directly from the Rust side. The NSIS installer is 1.4 MB.

Two parts were genuinely harder than the rest, both worth writing up here:

**Per-monitor overlays for mixed-DPI capture.** The obvious approach is one fullscreen
overlay spanning the virtual desktop, but that window has to pick a single DPI for every
monitor it covers, which is exactly the bug that makes screenshot tools crop wrong on
mixed-scale setups. Instead: capture every monitor with xcap first, then create one
overlay window per monitor, positioned in physical pixels via SetWindowPos. Each overlay
converts its own CSS-space drag using its own scale factor before the rectangle crosses
the IPC boundary, so every crop happens in that monitor's physical pixels. The trade-off
is that a selection can't span two screens. Caveat: I have a single display, so this path
is reasoned through and unit-tested but has never run on real mixed-DPI hardware.

**Keeping the radial menu on-screen.** A fixed circle of icons breaks as soon as the
bubble is near an edge, which is most of the time since it snaps to edges. getArc() takes
the bubble centre, the work area and an item count, works out which edges are blocking
(within radius + slack), and fans the items around the normalised sum of the inward
normals: full circle when nothing blocks, 160 degrees against one edge, 100 in a corner.
Pure function, no DOM, ~25 unit tests. That is the only reason I believe it works in the
corner cases I can't easily click through by hand.

A few Tauri-specific things that cost me time, in case they save you some:

- A synchronous #[tauri::command] runs on the main thread. Creating a WebviewWindow from
  one deadlocks — building a webview needs the event loop to pump messages and the event
  loop is sitting inside your command. No panic, no crash, process alive, main thread
  dead. run_on_main_thread doesn't save you either, because it runs the closure inline
  when it's already on the main thread. The fix is async fn.
- Any window not matched in capabilities/default.json has its IPC rejected silently. My
  capture overlays are labelled capture-0, capture-1... and needed a glob.
- tauri dev doesn't pass the app's stderr through, so eprintln and panics from the backend
  reach nobody. A second webview has no console either. I ended up writing traces to a
  file in %TEMP%, which found the deadlock above in one pass.
- Resizing a transparent window flickers if the content is centred: the move/resize is one
  atomic SetWindowPos but the webview re-laying out is a separate async paint, and the two
  can't be synchronised. I gave up on resizing and made the window a fixed size big enough
  for the open menu, with cursor-polled click-through so it doesn't eat clicks.

Source is MIT, link in comments. Happy to answer anything.
```

---

## 3. r/software and r/windowsapps

**Title:**

```
I made a tiny floating bubble for Windows — screenshots and quick notes, 1.4 MB, free
```

**Body:**

```
Mote is a small circle that floats on top of your other windows. You drag it wherever you
want and it snaps to the nearest edge of the screen so it stays out of the way. Click it
and a little menu fans out around it with two tools:

- **Screenshot** — the screen freezes, you drag a box around what you want, and it's
  copied to your clipboard and saved as a PNG in your Pictures folder.
- **Notes** — a small scratchpad next to the bubble. It saves as you type, and whatever
  you wrote is still there next time.

There's a hotkey (Ctrl+Shift+Space) that brings the bubble to your mouse from anywhere,
and a tray icon to hide it or quit. It can start with Windows if you want, but that's off
unless you turn it on.

The whole thing is a 1.4 MB download and uses about 25 MB of memory. A lot of apps like
this are built on Electron and run 150 MB or more; this one isn't.

It's free, there are no accounts, no ads, and it doesn't connect to the internet at all.

Two honest caveats:

- Windows will show a "Windows protected your PC" warning the first time you run it,
  because I haven't paid for a code-signing certificate. Click More info, then Run anyway.
- If you have two monitors set to different scaling levels, the screenshot tool is built
  to handle that but I only have one monitor, so I haven't been able to test it.

Windows 10 or 11, 64-bit.
```

---

## 4. X

Post the GIF natively as media. Do not put the link in the post body — links suppress
reach; put it in a reply.

**Post** (222 characters):

```
Made a floating bubble for Windows.

Drag it, it snaps to a screen edge. Click it, a radial menu fans out with a screenshot
tool and a notes pad.

1.4 MB installer. No Electron, no .NET, ~25 MB RAM.

Free and MIT licensed.
```

**Reply, immediately after:**

```
Source and download: https://github.com/Union88github/Mote

Tauri v2 + React. The fiddly parts were per-monitor capture overlays for mixed-DPI setups
and the arc geometry that keeps the menu on-screen near edges.
```

---

## 5. awesome-tauri

The list groups entries under headings and uses this format:

```
- [Mote](https://github.com/Union88github/Mote) - Floating always-on-top bubble for Windows with a radial menu, region screenshot and notes. 1.4 MB installer.
```

It belongs under **Applications → Productivity** (check the current headings before opening
the PR; that list gets reorganised). Their contributing guide asks that the project be
finished and documented, which is why the README and a real release matter more than the
PR wording.
