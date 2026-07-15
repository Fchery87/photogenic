# Release and Update Runbook

## Overview

This runbook covers publishing signed update artifacts and managing the Tauri auto-update feed for Photogenic.

## Prerequisites

- Tauri CLI (`@tauri-apps/cli`) installed
- A signing keypair generated via `tauri signer generate`
- The **private key** stored securely (CI secret or local keychain)
- The **public key** placed in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`

## Generating the Updater Signing Keypair

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/photogenic-updater.key
```

This produces:
- A private key file at the path you specify
- A password you set during generation
- A public key printed to stdout — paste this into `tauri.conf.json`

## Building Signed Release Artifacts

```bash
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/photogenic-updater.key) \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password" \
npm run tauri:build
```

The build outputs:
- Platform installers (`.msi`, `.dmg`, `.deb`, etc.)
- Update artifacts (`.msi.zip` / `.app.tar.gz` / `.AppImage.tar.gz`) with signatures
- A `latest.json` manifest describing the release

## Publishing the Update Feed

1. Upload the signed artifacts and `latest.json` to your update server (e.g., GitHub Releases, S3, or a dedicated update host).
2. Ensure the `endpoints` array in `tauri.conf.json` points to the correct URL pattern:
   ```
   https://releases.photogenic.example.com/{{target}}/{{arch}}/{{current_version}}
   ```
3. The endpoint must return a JSON manifest matching the [Tauri updater format](https://v2.tauri.app/plugin/updater/#update-server-json-format).

## Current Status: Internal Alpha

> **The updater pubkey and endpoint URL are placeholders.** Before any external release:
> 1. Generate a real signing keypair
> 2. Replace `plugins.updater.pubkey` with the real public key
> 3. Replace the endpoint URL with the real update server
> 4. Verify `npm run tauri:build` produces signed artifacts with `createUpdaterArtifacts: true`

The smoke test at `test/updater-config.test.js` explicitly checks for these placeholders so they are never silently shipped.

## Verifying Updates Work

```bash
# Build a version with a higher version number
# Change version in src-tauri/tauri.conf.json, build, publish to update server
# Then run the old version and trigger an update check
```
