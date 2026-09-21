import type { OllamaClient } from './client';
import { MINIMUM_OLLAMA_VERSION } from './defaults';
import type { OllamaStatus } from './types';
import { compareVersions, parseVersion } from './version';

/**
 * Asks Ollama for its version and reports whether it is usable. Read-only: a single
 * `GET /api/version`, cut off after the client's time limit.
 *
 * Anything that is not a clear Ollama answer (no connection, a timeout, an error
 * status, a body that is not JSON or has no version) is `unreachable`. That includes
 * "installed but not running", which a browser cannot tell apart from "not installed".
 */
export async function detectOllama(
  client: OllamaClient,
): Promise<OllamaStatus> {
  try {
    const response = await client.request('/api/version', {
      signal: AbortSignal.timeout(client.timeoutMs),
    });
    if (!response.ok) return { status: 'unreachable' };

    const body: unknown = await response.json();
    const version =
      typeof body === 'object' && body !== null && 'version' in body
        ? body.version
        : undefined;
    if (typeof version !== 'string') return { status: 'unreachable' };
    const parsed = parseVersion(version);
    const minimum = parseVersion(MINIMUM_OLLAMA_VERSION);
    if (!parsed || !minimum) return { status: 'unreachable' };

    return compareVersions(parsed, minimum) >= 0
      ? { status: 'ready', version }
      : { status: 'outdated', version, minimumVersion: MINIMUM_OLLAMA_VERSION };
  } catch {
    return { status: 'unreachable' };
  }
}
