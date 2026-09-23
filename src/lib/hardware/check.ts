import { embedTexts } from '../indexing/embed';
import type { OllamaClient } from '../ollama';
import { normalizeModelName } from '../ollama/models';

/** A short, fixed string: enough for a real embedding request, nothing meaningful to read. */
const PROBE_TEXT = 'hardware check';

export type AccelerationResult =
  | { status: 'accelerated' }
  | { status: 'not-accelerated' }
  /** Ollama unreachable, the request failed, or its answer did not say clearly either way. */
  | { status: 'inconclusive' };

/** One entry of `GET /api/ps`, the fields this module reads. */
interface RunningModel {
  model?: unknown;
  size?: unknown;
  size_vram?: unknown;
}

/** Reads `GET /api/ps` and returns its `models` list, or `undefined` if the call fails. */
async function runningModels(
  client: OllamaClient,
  signal?: AbortSignal,
): Promise<RunningModel[] | undefined> {
  try {
    const response = await client.request('/api/ps', { signal });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    const models =
      typeof body === 'object' && body !== null && 'models' in body
        ? body.models
        : undefined;
    return Array.isArray(models) ? models : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Finds `model`'s own entry and reports whether Ollama shows it running on a GPU: its
 * `size_vram` (bytes held in VRAM) greater than zero. Missing or malformed fields, or no
 * matching entry, count as `inconclusive`, the same as any other unclear answer.
 */
function readAcceleration(
  models: readonly RunningModel[],
  model: string,
): AccelerationResult {
  const target = normalizeModelName(model);
  const entry = models.find(
    (candidate) =>
      typeof candidate.model === 'string' &&
      normalizeModelName(candidate.model) === target,
  );
  if (!entry || typeof entry.size_vram !== 'number')
    return { status: 'inconclusive' };
  return entry.size_vram > 0
    ? { status: 'accelerated' }
    : { status: 'not-accelerated' };
}

/**
 * Makes one small request to `model` (not a download, not the larger chat model) and
 * reads from Ollama's own report whether that request ran on a GPU. Never throws: a
 * refused connection, a failed request, an aborted signal, or an answer that does not
 * say clearly either way all come back as `inconclusive`, matching how the rest of this
 * check is meant to be used - proceed, do not block, when the answer is not clear.
 */
export async function checkAcceleration(
  client: OllamaClient,
  model: string,
  signal?: AbortSignal,
): Promise<AccelerationResult> {
  const embedded = await embedTexts(client, model, [PROBE_TEXT], { signal });
  if (embedded.status !== 'ok') return { status: 'inconclusive' };

  const models = await runningModels(client, signal);
  if (!models) return { status: 'inconclusive' };

  return readAcceleration(models, model);
}
