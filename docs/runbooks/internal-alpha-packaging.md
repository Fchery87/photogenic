# Internal Alpha Runbook — Cross-Platform Packaging (Issue 15)

## Overview

This runbook covers building, smoke-testing, and packaging the Photogenic
internal alpha for macOS, Windows, and Linux. Each platform section documents
prerequisites, the build command, expected outputs, and GPU/CPU fallback
behavior.

## Prerequisites (all platforms)

- **Node.js** ≥ 20 (≥ 24 recommended for `node:sqlite` smoke tests)
- **Rust toolchain** (`rustup` + stable toolchain)
- **Tauri CLI** — resolved automatically via `npx @tauri-apps/cli@2.11.4`

## Smoke testing

Run the platform smoke script before packaging:

```bash
npm run smoke
```

This exercises the full alpha workflow chain (Tauri availability → Pipeline →
License → Import → Cull → Develop → Preset → Batch Sync → Export → Viewport
proof) and writes a JSON report to:

```
.scratch/photogenic-foundation/verification/smoke-<platform>.json
```

The report includes explicit pass/fail fields for each step. All steps must
pass before packaging.

## Platform: macOS

### Prerequisites

- Xcode Command Line Tools (`xcode-select --install`)
- Rust target: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`

### Build

```bash
npm run tauri:build
```

### Expected outputs

- `src-tauri/target/release/bundle/dmg/*.dmg` — universal disk image
- `src-tauri/target/release/bundle/macos/*.app` — application bundle

### GPU/CPU fallback

- **GPU (Metal):** wgpu selects the Metal backend automatically on Apple Silicon
  and Intel Macs with Metal support.
- **CPU fallback:** if Metal is unavailable, the pipeline falls back to the CPU
  compute path. The smoke script reports `pipelineMode: "cpu-fallback"`.

### Viewport proof

Run `npm run tauri:dev` on a Mac with a display. The viewport-proof harness
measures the GPU→webview frame path and writes results to
`verification/viewport-darwin.json`.

## Platform: Windows

### Prerequisites

- **Visual Studio Build Tools 2022** with the "Desktop development with C++" workload
- **WebView2 Runtime** (preinstalled on Windows 11; download for Windows 10)
- Rust target: `rustup target add x86_64-pc-windows-msvc`

### Build

```bash
npm run tauri:build
```

### Expected outputs

- `src-tauri/target/release/bundle/msi/*.msi` — MSI installer
- `src-tauri/target/release/bundle/nsis/*.exe` — NSIS installer

### GPU/CPU fallback

- **GPU (DirectX 12):** wgpu selects the DX12 backend on systems with a
  compatible GPU and driver.
- **CPU fallback:** if no suitable GPU is detected, the pipeline falls back to
  the CPU compute path.

### Viewport proof

Run `npm run tauri:dev` on a Windows machine with a display. Results are written
to `verification/viewport-win32.json`.

## Platform: Linux

### Prerequisites

- **System libraries:**
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
  ```
  (Fedora/RHEL/Arch equivalents documented in the Tauri prerequisites guide.)
- Rust target: system default (`x86_64-unknown-linux-gnu`)

### Build

```bash
npm run tauri:build
```

### Expected outputs

- `src-tauri/target/release/bundle/deb/*.deb` — Debian package
- `src-tauri/target/release/bundle/appimage/*.AppImage` — AppImage
- `src-tauri/target/release/bundle/rpm/*.rpm` — RPM package (if rpmbuild is installed)

### GPU/CPU fallback

- **GPU (Vulkan):** wgpu selects the Vulkan backend when a compatible Mesa or
  proprietary driver is present.
- **CPU fallback:** on headless or GPU-less systems (CI), the pipeline uses the
  CPU compute path. This is the default in the current headless Linux smoke
  environment.

### Viewport proof

Run `npm run tauri:dev` on a Linux machine with a display server (X11 or
Wayland) and a GPU. Results are written to `verification/viewport-linux.json`.
Headless Linux (no display) cannot measure the GPU→webview path — the viewport
proof remains provisional on headless systems.

## Final acceptance checklist

Before marking Issue 15 as done, verify all of the following:

1. ✅ `npm test` passes (all JS tests)
2. ✅ `cargo test --manifest-path src-tauri/Cargo.toml` passes (all Rust tests)
3. ✅ `npm run build` succeeds
4. ✅ `npm run smoke` passes all steps on the current platform
5. ✅ `npm run tauri:build` completes or fails with a documented missing dependency
6. ✅ Smoke report exists at `verification/smoke-<platform>.json`
7. ✅ Viewport proof status is recorded (unlocked or provisional)
8. ✅ Cross-platform smoke reports exist for macOS, Windows, and Linux

## Report locations

All verification artifacts live under:

```
.scratch/photogenic-foundation/verification/
├── smoke-linux.json        # Platform smoke report (Linux)
├── smoke-darwin.json       # Platform smoke report (macOS)
├── smoke-win32.json        # Platform smoke report (Windows)
├── viewport-linux.json     # Viewport proof (Linux)
├── viewport-macos.json     # Viewport proof (macOS)
├── viewport-windows.json   # Viewport proof (Windows)
└── acceptance.json         # Final acceptance artifact
```

## Known limitations (internal alpha)

- **RAW decode is stubbed:** the native pipeline consumes JS-supplied sample
  data, not real RAW-decoded pixels. Software renderers produce deterministic
  test images (real JPEG/PNG/TIFF-16 bytes) but not final RAW/GPU pipeline
  output.
- **Viewport proof is provisional on headless platforms:** the GPU→webview frame
  path can only be measured on a platform with a display server and GPU.
- **Licensing public key is not yet embedded in the Tauri config:** the
  activation API is complete and tested, but production wiring awaits the app UI
  bootstrap (Issue 12).
