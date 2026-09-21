import { DOWNLOAD_URLS, INSTALL_STEPS } from './defaults';
import type { InstallGuidance, Platform } from './types';

/**
 * What the interface needs to help someone get Ollama running: the official download
 * page for their platform and the ordered steps. There is no display wording here; the
 * interface supplies text in the reader's language. An unrecognised platform gets the
 * general download page.
 */
export function installGuidance(
  platform: Platform = 'unknown',
): InstallGuidance {
  return {
    downloadUrl: DOWNLOAD_URLS[platform] ?? DOWNLOAD_URLS.unknown,
    steps: [...INSTALL_STEPS],
  };
}
