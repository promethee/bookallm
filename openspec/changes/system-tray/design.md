# Design

## Context

- `src-tauri/src/lib.rs` builds the app with the opener plugin, shows the window once the page has loaded (it starts hidden), and has a safety net that shows it after 3 s. There is no tray and no app-defined command yet.
- Tauri 2 includes a tray behind the `tauri` crate's `tray-icon` feature (`TrayIconBuilder`, `Menu`, `MenuItem`), and lets the app intercept a window's close with `WindowEvent::CloseRequested` and `api.prevent_close()`.
- Settings live in the webview's `localStorage` (`src/lib/storage/settings.ts`), which the Rust side cannot read. The interface language is also decided in the webview.
- `src/lib/platform.ts` already tells the desktop app from the browser build (`__TAURI_INTERNALS__` in `window`), which is how `openExternal` picks the opener plugin.
- Automated tests (Vitest, Playwright) run the interface in a browser; nothing there can observe a tray.

## Goals / Non-Goals

**Goals:**

- The native side stays small and has no settings of its own: the webview tells it what to do.

**Non-Goals:**

- Start-at-login, notifications, platform-specific tray polish (see proposal).

## Decisions

### 1. One command, `configure_tray`, pushed from the webview

Rust keeps a `TrayConfig { close_to_tray: bool }` in managed state (a `Mutex`) with `close_to_tray: true` until told otherwise, and exposes one command, `configure_tray(close_to_tray, show_label, quit_label)`, which stores the flag and renames the two menu items. The webview calls it after settings load, and again whenever the setting or the language changes.

Starting with `true` on the native side matches the default, so a close before the page has loaded behaves as the default does.

Alternative: the native side reads settings from a file. Rejected: settings are the webview's, and duplicating them would need syncing anyway.

### 2. The webview side goes through `Services`

`Services` gains `configureTray(config: TrayConfig): Promise<void>`. The real implementation (`src/lib/tray.ts`) calls `invoke('configure_tray', ...)` from `@tauri-apps/api/core` only inside the desktop app and does nothing in the browser; it never throws (a failure is logged and ignored, since the tray is a convenience). Tests use a fake that records the calls. The controller calls it from `start()`, from `setCloseToTray()`, and when the language changes.

### 3. Close handling

`on_window_event` on `CloseRequested`: if `close_to_tray`, call `api.prevent_close()` and `window.hide()`; otherwise let the close proceed, which quits the app because it has one window. "Quit BookaLLM" calls `app.exit(0)`, which does not go through `CloseRequested`, so it always quits.

### 4. Showing the window

Tray left-click (`TrayIconEvent::Click` with the left button released) and "Show BookaLLM" both call one helper: `unminimize`, `show`, `set_focus` on the `main` window. The tray uses the app's default window icon; the tooltip is "BookaLLM" in both languages (the app's name).

### 5. The setting and checkbox

`Settings.closeToTray?: boolean`, absent meaning on; `parseSettings` keeps it only when it is a boolean. `TrayOption.svelte`: a labelled checkbox under the idle unload control, calling `controller.setCloseToTray(on)`.

### 6. Testing split

- Vitest: settings parsing; the controller sends the right configuration at start, on change and on a language change; the checkbox.
- Playwright (browser): the checkbox is saved and survives a reload; keyboard use.
- Rust: `cargo clippy -- -D warnings` and a debug build.
- `MANUAL_TESTS.md`: the tray itself, in the real desktop app, step by step with the expected result, since no automated test can see it.

## Risks / Trade-offs

- [A reader thinks X quit the app while it keeps running] → The tray icon stays visible, and the checkbox (on the main screen, next to the idle setting) lets X quit instead; idle unload keeps a hidden app from holding the models' memory.
- [The webview fails to call `configure_tray`] → The native defaults match the app's defaults (hide on close, English menu), so the app still behaves sensibly.
- [Two ways to close from Rust (`CloseRequested` vs `exit`)] → Quit uses `exit`, so it can never be swallowed by the hide rule.

## Migration Plan

One optional setting is added. Rollback: revert; the extra setting is ignored.
