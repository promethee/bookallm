# Proposal

## Why

Closing BookaLLM's window quits it, so reopening means starting the app and its checks again. The README's v1 architecture has the app "stay resident in systray for instant reopen", with idle model unloading (now built) keeping that from holding memory. The tray is the last v1 item not built.

## What Changes

- BookaLLM shows an icon in the system tray while it runs, with the tooltip "BookaLLM" and a menu: "Show BookaLLM" and "Quit BookaLLM".
- Closing the window (its X button) hides it to the tray instead of quitting, so the app, its conversation and its checks stay as they were. Clicking the tray icon or "Show BookaLLM" brings the window back, focused.
- "Quit BookaLLM" in the tray menu really quits.
- A "Keep running in the tray when closed" checkbox on the main screen, on by default and saved like other settings, lets a reader make the X button quit instead.
- The tray menu follows the interface language (English or French).
- The app gains the official `@tauri-apps/api` package (^2, already present as a dependency of `@tauri-apps/plugin-opener`) to send that setting and the menu text to the native side; the `tauri` crate gets its built-in `tray-icon` feature. No other new dependency.
- A new `MANUAL_TESTS.md` describes how a person checks the tray in the real desktop app, since automated tests run the interface in a browser, where there is no tray.

### Non-goals

- Starting BookaLLM when Windows starts.
- Notifications (such as "still running in the tray").
- Any tray behaviour in the browser build used for development and tests: there, the checkbox is saved but has no effect.
- macOS and Linux specifics beyond what Tauri's tray does by default; this is built and checked on Windows.

## Capabilities

### New Capabilities

- `system-tray`: the tray icon and its menu, hiding to the tray on close, showing and quitting from the tray, the "keep running in the tray" setting, and the tray following the interface language.

### Modified Capabilities

(none)

## Impact

- `src-tauri/Cargo.toml` (`tray-icon` feature) and `src-tauri/src/lib.rs`: tray, menu, close handling and one command, `configure_tray`, with brief comments on Rust-specific syntax as the project asks.
- `package.json`: `@tauri-apps/api`.
- `src/lib/storage/settings.ts` (`closeToTray`), `src/lib/onboarding/services.ts` and `controller.svelte.ts` (sending the tray configuration), a small `src/lib/tray.ts`, a checkbox component, and messages.
- New `MANUAL_TESTS.md`.
