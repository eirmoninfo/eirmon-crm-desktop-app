# Windows auto-updates

Eirmon One uses `electron-updater` with GitHub Releases. Update checks run only
in packaged builds; `npm run electron:dev` intentionally reports that updates
are disabled.

## Release files

Each public Windows release must contain files produced by the same build:

- `Eirmon One-Setup-X.Y.Z.exe` — NSIS installer.
- `latest.yml` — update manifest containing the current version, installer URL,
  SHA-512 checksum, size, and block-map metadata.
- `Eirmon One-Setup-X.Y.Z.exe.blockmap` — block hashes used to download only
  changed portions of the installer when differential download is possible.

Do not hand-edit `latest.yml`, rename only one artifact, or mix files from
different builds. `electron-builder` generates and publishes them together.
If differential download cannot be used, `electron-updater` safely downloads
the full installer.

## Version and release process

1. Update the application version:

   ```bash
   npm version patch --no-git-tag-version
   ```

2. Commit `package.json` and `package-lock.json`.
3. Push the commit.
4. Create and push the matching tag:

   ```bash
   git tag -a "v$(node -p "require('./package.json').version")" -m "Release"
   git push origin main --follow-tags
   ```

5. The `Windows Release` GitHub Actions workflow validates that the tag matches
   `package.json`, builds on Windows, and publishes the installer, `latest.yml`,
   and blockmap using the repository-scoped `GITHUB_TOKEN`.
6. Confirm the GitHub release is public and all three assets are present.

Never ship the same version twice. Update selection is based on semantic
versioning, so every release must have a version greater than the installed
version.

## Runtime behavior

- The app checks after the renderer finishes loading and every 30 minutes.
- Downloads run automatically in the background.
- The renderer receives checking, available, progress, downloaded, unavailable,
  disabled, and error events through a narrow `contextBridge` API.
- After download, the user chooses **Install Now** or **Later**.
- **Install Now** calls `quitAndInstall(false, true)`.
- **Later** leaves the update ready; `autoInstallOnAppQuit` installs it during a
  later normal quit.

Logs are written by `electron-log`. On Windows, inspect:

```text
%APPDATA%\Eirmon One\logs\main.log
```

## Troubleshooting

### No update is found

- Confirm the installed app is packaged, not running through Electron dev mode.
- Confirm the new version is greater than the installed version.
- Confirm the tag exactly matches `package.json` (`v0.2.5` for version `0.2.5`).
- Confirm the GitHub release is published, not only a draft.
- Confirm `latest.yml` belongs to the same build as the installer.

### GitHub publishing returns 401

GitHub Actions should use `${{ secrets.GITHUB_TOKEN }}` with
`permissions: contents: write`. For a local publish, use a valid fine-grained
token with repository Contents read/write access. Never embed a token in the
application or commit one to the repository.

### Checksum mismatch

Delete and republish all update assets from one clean build. A checksum mismatch
usually means the installer was replaced without replacing `latest.yml`.

### Download progress stops or differential download fails

Verify the `.blockmap` is present and has the exact filename referenced by
`latest.yml`. Proxy/CDN caching may serve stale metadata. The updater can fall
back to a full installer download.

### Update downloads but does not install

- Install the app using the NSIS installer; do not run `win-unpacked` as the
  installed product.
- Check `main.log` for `quitAndInstall` or permission errors.
- Ensure antivirus software has not quarantined the downloaded installer.
- Use the **Install Now** button or quit the app normally after choosing Later.

### Windows notification or identity issues

The packaged app registers `com.eirmon.crm` as its AppUserModelID, matching the
builder `appId`, and the NSIS installer creates a Start Menu shortcut. Uninstall
older development builds before testing a newly installed release.

## Security

The main window keeps `nodeIntegration: false`, `contextIsolation: true`, and
renderer sandboxing enabled. The preload exposes only dedicated updater
methods/events rather than `ipcRenderer`. Main-process updater handlers also
verify that requests originate from the primary renderer.
