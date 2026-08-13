# Maintaining Mote

Notes for whoever is building and releasing this. Users don't need any of it.

## Changing the icon

`app/src-tauri/icons/source.png` is the 1024px master. Regenerate every size from it:

```bash
cd app
npx tauri icon src-tauri/icons/source.png
```

That also emits iOS and Android sets. Mote is Windows-only, so delete them:

```bash
rm -rf src-tauri/icons/android src-tauri/icons/ios
```

Then **clean the crate before rebuilding**:

```bash
cd src-tauri && cargo clean -p mote && cd .. && npm run tauri build
```

Cargo caches the compiled Windows resource that carries the icon, and replacing the `.ico`
alone does not invalidate it — an incremental build will happily embed the *previous* icon
while every file on disk looks correct. This is not theoretical; it shipped once. Verify
the result rather than trusting the file dates:

```powershell
Add-Type -AssemblyName System.Drawing
[System.Drawing.Icon]::ExtractAssociatedIcon("app\src-tauri\target\release\mote.exe").ToBitmap().Save("$env:TEMP\check.png")
```

CI builds from a clean checkout and is never affected by this.

## Cutting a release

1. Bump the version in all three places — they must agree, and Tauri names the installer
   from them:
   - `app/package.json`
   - `app/src-tauri/Cargo.toml`
   - `app/src-tauri/tauri.conf.json`
2. Update `RELEASE_NOTES.md`. The workflow reads that file verbatim into the release body.
3. Commit, then tag and push:

   ```bash
   git tag v1.1.0 && git push origin v1.1.0
   ```

The workflow (`.github/workflows/release.yml`) builds on a Windows runner, runs the tests,
and creates a **draft** release with the installer attached. Review it on the Releases page
and publish manually.

Note that pushing a tag with a personal token triggers the workflow, but a release created
through the API by that same token does too — creating a release by hand *and* pushing the
tag will run the build twice against the same tag.

## Layout

```
app/                 the application
  src/               React frontend
  src-tauri/         Rust backend
docs/                README assets and these notes
.github/workflows/   release automation
```

`app/src-tauri/src/` is where the hard-won parts live. `bubble.rs` carries the window
invariants, `capture.rs` the screenshot pipeline; both have long comments explaining why
they are shaped the way they are. Read those before changing window geometry or capture
ordering.
