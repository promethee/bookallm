# Manual tests

Checks a person runs by hand, for behaviour the automated tests cannot see. The
automated tests (`pnpm test`, `pnpm test:e2e`) run the interface in a browser;
what only exists in the desktop app is checked here.

## Before you start

1. Build the desktop app: `pnpm tauri build --debug --no-bundle`.
2. Make sure Ollama is running with the default models, and that a book is
   already imported and indexed (import one from the app if not).
3. Start `src-tauri\target\debug\bookallm.exe`.

## System tray (Windows)

Each step lists the action, then the expected result.

1. **Look at the tray** (bottom right of the taskbar; open the `^` overflow
   if needed).
   - Expected: a BookaLLM icon is there. Hovering it shows "BookaLLM".
2. **Ask a question** on the main screen and wait for the answer.
   - Expected: the answer shows as usual.
3. **Check "Keep running in the tray when closed"** under "Free memory
   after" on the main screen.
   - Expected: it is ticked.
4. **Close the window** with its X button.
   - Expected: the window disappears; the tray icon stays; the app does not
     appear to restart.
5. **Left-click the tray icon.**
   - Expected: the window comes back, in front, with the question and answer
     from step 2 still shown.
6. **Close the window again, then right-click the tray icon.**
   - Expected: a menu with "Show BookaLLM" and "Quit BookaLLM".
7. **Choose "Show BookaLLM".**
   - Expected: the window comes back, in front, as it was.
8. **Minimise the window, then left-click the tray icon.**
   - Expected: the window is restored and in front.
9. **Switch the language to Français** (top of the window), then right-click
   the tray icon.
   - Expected: the menu reads "Afficher BookaLLM" and "Quitter BookaLLM".
     Switch back to English.
10. **Untick "Keep running in the tray when closed", then close the window.**
    - Expected: the app quits; the tray icon disappears.
11. **Start the app again.**
    - Expected: the option is still unticked. Tick it again for normal use.
12. **Right-click the tray icon and choose "Quit BookaLLM".**
    - Expected: the app quits and the tray icon disappears, even though the
      option is ticked.
