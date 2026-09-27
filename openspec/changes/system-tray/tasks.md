# Tasks

## 1. Webview side

- [ ] 1.1 Add `@tauri-apps/api` (^2) to `package.json` with `pnpm add`; verify `pnpm install` and `pnpm typecheck` succeed
- [ ] 1.2 Add `closeToTray` to `Settings` with validation in `parseSettings` (design decision 5); verify with settings tests: absent by default, true and false kept, a non-boolean dropped
- [ ] 1.3 Add `configureTray` to `Services` with `src/lib/tray.ts` (invoke inside the desktop app, no-op in the browser, never throws) and a recording fake in the test harness (design decision 2); verify with a `tray.test.ts` for the browser no-op and the invoke arguments
- [ ] 1.4 Call it from the controller at start, from a new `setCloseToTray`, and on language change; verify with a new `controller.tray.test.ts`: default on with English labels at start, the saved value after a change, French labels after switching language
- [ ] 1.5 Add the English and French messages (checkbox label, tray menu items) and `TrayOption.svelte` under the idle unload control; verify with the i18n key-parity test and a component test: on by default, turning it off saves it, French label
- [ ] 1.6 Run `pnpm exec vitest run` and `pnpm lint`, then commit ("Add the tray setting and send it to the native side")

## 2. Native side

- [ ] 2.1 Enable the `tray-icon` feature in `src-tauri/Cargo.toml` and add the tray icon, tooltip and menu, the show helper, the close handling and the `configure_tray` command in `src-tauri/src/lib.rs` (design decisions 1, 3, 4), with brief comments on Rust-specific syntax; verify with `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` and `pnpm format:rust:check`
- [ ] 2.2 Build the desktop app in debug (`pnpm tauri build --debug --no-bundle`); verify it compiles and the executable starts
- [ ] 2.3 Commit ("Add the system tray to the desktop app")

## 3. End to end and manual tests

- [ ] 3.1 Add `e2e/tray-option.spec.ts`: the checkbox is on by default, turning it off survives a reload, keyboard-only toggle; verify with `pnpm exec playwright test`
- [ ] 3.2 Create `MANUAL_TESTS.md` with a tray section (start, close with the setting on, reopen from icon and menu with the conversation kept, quit from the menu, setting off then close quits, French menu), each step with the action and the expected result; verify with markdownlint
- [ ] 3.3 Commit ("Add tray e2e and manual tests")

## 4. Real-world check and wrap-up

- [ ] 4.1 Run the desktop app on this machine and go through the `MANUAL_TESTS.md` tray section with the reader (they see the tray; results reported back), recording the outcome in this change's design.md; verify the notes are written
- [ ] 4.2 Update the README Status section (tray built; no v1 item left unbuilt except history trimming); verify with markdownlint
- [ ] 4.3 Add the new French messages to the deferred French review memory file, then commit ("Finish system-tray")
