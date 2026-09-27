/** What the desktop app's tray needs from the interface: its setting and menu text. */
export interface TrayConfig {
  /** Whether closing the window hides it to the tray (true) or quits the app. */
  closeToTray: boolean;
  /** The tray menu item that brings the window back, in the interface language. */
  showLabel: string;
  /** The tray menu item that quits the app, in the interface language. */
  quitLabel: string;
}

export interface TrayDeps {
  /** Defaults to detecting the desktop app's webview. */
  isTauri?: boolean;
  /** Defaults to Tauri's own `invoke`. */
  invoke?: (command: string, args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Sends the tray configuration to the desktop app's native side (the `configure_tray`
 * command). Does nothing in the browser build, which has no tray, and never throws: the
 * tray is a convenience, and the native side's defaults match the app's.
 */
export async function configureTray(
  config: TrayConfig,
  deps: TrayDeps = {},
): Promise<void> {
  const isTauri =
    deps.isTauri ??
    (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  if (!isTauri) return;
  try {
    const invoke = deps.invoke ?? (await import('@tauri-apps/api/core')).invoke;
    await invoke('configure_tray', { ...config });
  } catch (error) {
    console.warn('Could not configure the tray:', error);
  }
}
