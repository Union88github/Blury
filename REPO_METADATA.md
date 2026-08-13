# Repo metadata

Not applied automatically — paste these into the GitHub UI yourself.

## Description

Settings → General → Description (max 350 chars, but short reads better in search
results and on your profile).

**Recommended** (96 characters) — leads with the size, which is the differentiator:

```
A 1.4 MB floating bubble for Windows with a radial menu, screenshot tool and notes. No Electron.
```

If you want it shorter, this is 83:

```
A 1.4 MB floating bubble for Windows. Radial menu, screenshots, notes. No Electron.
```

Alternatives, if you prefer a different emphasis:

```
Floating always-on-top bubble for Windows with a radial menu, screenshot tool and notes
```

```
1.4 MB always-on-top bubble for Windows: drag it anywhere, click for screenshots and notes
```

## Topics

Settings → General → Topics, or the gear icon beside "About" on the repo home page.
GitHub allows up to 20; these 11 cover what people actually search for.

```
windows
tauri
rust
react
typescript
desktop-app
screenshot
radial-menu
productivity
always-on-top
system-tray
```

Notes on the choices:

- `tauri`, `rust`, `react`, `typescript` — the stack. These bring in people browsing
  Tauri projects for reference, which is a real source of traffic for small desktop apps.
- `windows`, `desktop-app` — platform. Worth being explicit; this is Windows-only and
  saying so up front saves everyone's time.
- `screenshot`, `radial-menu`, `always-on-top`, `system-tray` — the features someone
  would actually type into search.
- `productivity` — the category browsers filter by.

Deliberately omitted: `gui`, `app`, `tool`, `utility`. Too generic to surface anything.

## Other settings worth checking when you publish

- **Releases** must be enabled for the README's download link to resolve.
- Turn **Wikis**, **Projects** and **Discussions** off unless you want to maintain them;
  empty tabs on a new repo read as abandoned.
- Set the **social preview image** (Settings → General → Social preview) if you have one —
  it is what shows when the repo is linked on Reddit.
