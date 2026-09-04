# macOS and Windows auto-updates

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

Each macOS release should contain:

- `Eirmon One-X.Y.Z-x64.dmg` and `Eirmon One-X.Y.Z-arm64.dmg` — manual installers.

Do **not** attach `latest-mac.yml` or Mac ZIP files until the app is signed with an
Apple Developer ID Application certificate. Those files make already-installed
unsigned Mac apps download a ShipIt update and fail with
`code failed to satisfy specified code requirement(s)`.

When Developer ID signing is configured, also attach:

- Matching ZIP files — payloads used by `electron-updater`.
- `latest-mac.yml` — the macOS update manifest.
- Any generated blockmap files.

The macOS app must be signed with an Apple **Developer ID Application**
certificate. For normal distribution outside the Mac App Store, it should also
be notarized. An unsigned build can be downloaded manually, but should not be
treated as a working macOS auto-update release.

## One-time GitHub repository setup

In **Settings → Actions → General → Workflow permissions**, enable **Read and
write permissions**. The workflow also declares `contents: write`, allowing its
repository-scoped `GITHUB_TOKEN` to create the GitHub Release.

Windows publishing needs no additional secret. For signed and notarized macOS
updates, add these repository Actions secrets:

- `MAC_CERTIFICATE_P12` — base64-encoded Developer ID Application `.p12` file.
- `MAC_CERTIFICATE_PASSWORD` — password used when exporting that `.p12`.
- `APPLE_ID` — Apple developer account email.
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password for that Apple ID.
- `APPLE_TEAM_ID` — the 10-character Apple Developer team ID.

For example, create the certificate secret on macOS with:

```bash
base64 -i DeveloperIDApplication.p12 | pbcopy
```

Paste the clipboard value into `MAC_CERTIFICATE_P12`. Never commit certificates,
passwords, Apple credentials, or GitHub tokens to the repository.

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

5. The `Desktop Release` GitHub Actions workflow validates that the tag matches
   `package.json`, builds on native Windows and macOS runners, and publishes the
   installers and update manifests using the repository-scoped `GITHUB_TOKEN`.
6. Confirm the GitHub release is public and contains the Windows EXE,
   `latest.yml`, macOS DMG/ZIP files, `latest-mac.yml`, and blockmaps.

Never ship the same version twice. Update selection is based on semantic
versioning, so every release must have a version greater than the installed
version.

## Runtime behavior

- On Windows (packaged), the app checks after the renderer finishes loading and
  every 30 minutes. On macOS, in-app auto-install stays off until the app is
  signed with a Developer ID Application certificate.
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

On macOS, inspect:

```text
~/Library/Logs/Eirmon One/main.log
```

## Troubleshooting

### No update is found

- Confirm the installed app is packaged, not running through Electron dev mode.
- Confirm the new version is greater than the installed version.
- Confirm the tag exactly matches `package.json` (`v0.2.5` for version `0.2.5`).
- Confirm the GitHub release is published, not only a draft.
- Confirm `latest.yml` belongs to the same build as the installer.
- On macOS, confirm `latest-mac.yml` and its referenced ZIP are both attached.

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

### Update downloads but macOS says the signature failed

Squirrel.Mac (ShipIt) will only replace the installed app with a build signed by
the **same Developer ID Application** certificate. Ad-hoc or unsigned local
builds cannot auto-update — macOS reports `code failed to satisfy specified code
requirement(s)`.

Unsigned and ad-hoc Mac builds never call `checkForUpdates` on macOS, so ShipIt
does not run. **Check updates** opens a short message to download the GitHub DMG
instead of showing the raw cache path. `npm run release:win` does not replace
the Mac app; install a new Mac DMG / `.app` to pick up this behavior.

To enable Mac auto-update:

1. Add `MAC_CERTIFICATE_P12` and `MAC_CERTIFICATE_PASSWORD` to GitHub Actions
   secrets.
2. Publish a signed, notarized release.
3. Users must install that signed DMG once; later updates can then apply in-app.

### Update downloads but does not install

- Install the app using the NSIS installer; do not run `win-unpacked` as the
  installed product.
- Check `main.log` for `quitAndInstall` or permission errors.
- Ensure antivirus software has not quarantined the downloaded installer.
- Use the **Install Now** button or quit the app normally after choosing Later.
- On macOS, verify the installed app and new release are signed by the same
  Developer ID identity (`codesign -dv --verbose=4 "/Applications/Eirmon One.app"`).

### Windows notification or identity issues

The packaged app registers `com.eirmon.crm` as its AppUserModelID, matching the
builder `appId`, and the NSIS installer creates a Start Menu shortcut. Uninstall
older development builds before testing a newly installed release.

## Security

The main window keeps `nodeIntegration: false`, `contextIsolation: true`, and
renderer sandboxing enabled. The preload exposes only dedicated updater
methods/events rather than `ipcRenderer`. Main-process updater handlers also
verify that requests originate from the primary renderer.
