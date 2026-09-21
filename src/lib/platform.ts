import type { Platform } from './ollama';

interface PlatformInfo {
  /** `navigator.userAgentData.platform`, when the browser has it. */
  userAgentDataPlatform?: string;
  platform?: string;
  userAgent?: string;
}

/**
 * The reader's operating system, used to pick the right download page. Anything not
 * recognised is `unknown`, which gets the general page.
 */
export function detectPlatform(info?: PlatformInfo): Platform {
  const source =
    info ??
    (typeof navigator === 'undefined'
      ? {}
      : {
          userAgentDataPlatform: (
            navigator as Navigator & { userAgentData?: { platform?: string } }
          ).userAgentData?.platform,
          platform: navigator.platform,
          userAgent: navigator.userAgent,
        });
  const text = [source.userAgentDataPlatform, source.platform, source.userAgent]
    .filter(Boolean)
    .join(' ');
  if (/win/i.test(text) && !/darwin/i.test(text)) return 'windows';
  if (/mac|darwin/i.test(text)) return 'macos';
  if (/linux|x11/i.test(text)) return 'linux';
  return 'unknown';
}

/**
 * The only addresses the app will ever open in the browser: `https://ollama.com` pages.
 * The host must be exactly `ollama.com`, with no credentials and no custom port, so
 * look-alikes such as `ollama.com.evil.test` or `https://ollama.com@evil.test` fail.
 */
export function isOfficialOllamaUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'ollama.com' &&
      url.username === '' &&
      url.password === '' &&
      url.port === ''
    );
  } catch {
    return false;
  }
}

export interface OpenExternalDeps {
  /** Whether the app is running inside Tauri. Defaults to checking for its bridge. */
  isTauri?: boolean;
  openInTauri?: (url: string) => Promise<void>;
  openInBrowser?: (url: string) => void;
}

/**
 * Opens an official Ollama page in the reader's default browser and says whether it
 * did. Any other address is refused and nothing opens. Inside Tauri it uses the opener
 * plugin (whose own scope also allows only `https://ollama.com/*`); in a plain browser,
 * as in development and tests, it opens a new tab.
 */
export async function openExternal(
  url: string,
  deps: OpenExternalDeps = {},
): Promise<boolean> {
  if (!isOfficialOllamaUrl(url)) return false;
  const isTauri =
    deps.isTauri ??
    (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  try {
    if (isTauri) {
      const openInTauri =
        deps.openInTauri ??
        (async (target: string) =>
          (await import('@tauri-apps/plugin-opener')).openUrl(target));
      await openInTauri(url);
    } else {
      (
        deps.openInBrowser ??
        ((target) => void window.open(target, '_blank', 'noopener,noreferrer'))
      )(url);
    }
    return true;
  } catch {
    return false;
  }
}
