# Piko for macOS

[中文说明](README.zh-CN.md)

Piko Desktop packages the group/member chat workspace, local gateway and Node.js runtime in a Tauri application. The interface stays local; AI tasks use the coding tools and accounts configured on your Mac.

## Run

Open `Piko.app`. The local service starts automatically and the window connects to its assigned port. Close the window to leave tasks running; click the Dock icon or menu bar icon to return. `⌘,` opens settings. Quit (`⌘Q`) stops the service and asks for confirmation when tasks are active.

The current build targets Apple Silicon and macOS 13.5 or later. Node.js is bundled. Install and sign in to a supported coding CLI (such as Codex) before asking an agent to work. The app discovers command-line tools even when opened from Finder.

## Build and install

From the repository root, with Node.js, pnpm, Rust and Xcode command-line tools installed:

```sh
pnpm install
pnpm build:desktop
```

Outputs are under `apps/desktop/src-tauri/target/release/bundle/`: `macos/Piko.app` and `dmg/*.dmg`. Quit the desktop app, then run `pnpm install:desktop` to build and install to `~/Applications`. Previous versions are kept in `.piko-backups/` under the installation directory. `PIKO_INSTALL_DIR` can override the destination.

The build copies the Node executable on `PATH`; its architecture and minimum macOS version must match the intended release. This repository currently configures an ad-hoc signature for local testing. Public distribution requires your Apple Developer ID, hardened runtime review and notarization; a successful local build does not perform notarization.

## Data and recovery

Desktop data lives in `~/Library/Application Support/com.crewloom.desktop/runtime`. The app menu can reveal this directory. The stable application identity preserves existing members, chats, persona files, and preferences when upgrading to Piko. It is independent of the web/CLI profile, so the desktop service cannot stop a gateway using another profile. Project source files stay in the folders chosen for those projects.

Every launch requests an available loopback-only port. The app reconnects to its own service rather than using a cached port. If the service stops unexpectedly, use the restart button in the window. The packaged UI can issue only the explicitly registered native commands; arbitrary shell execution is not exposed to the webview.

`PIKO_DESKTOP_DATA_DIR` overrides the desktop profile for isolated testing. Never point simultaneously running copies at the same profile. Replacing the app does not remove its persistent profile.

## Development

```sh
pnpm --filter piko-desktop dev
pnpm --filter piko exec node --import tsx --test src/__tests__/desktop-runtime.test.ts
```

Development mode uses the web development server and gateway; release mode owns the bundled gateway. The integration test covers random ports, independent profiles, authentication and loopback-only binding without invoking an AI model.
