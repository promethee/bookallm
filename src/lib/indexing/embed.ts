import type { OllamaClient } from '../ollama';
import type { EmbedResult, IndexError } from './types';

/** How many texts go in one request: few enough that progress moves often. */
export const EMBED_BATCH_SIZE = 16;

/** How long one request may take before Ollama counts as not answering. */
export const EMBED_TIMEOUT_MS = 120_000;

export interface EmbedOptions {
  /** Aborting this cancels the request and gives `aborted`. */
  signal?: AbortSignal;
  /** Replaces `EMBED_TIMEOUT_MS`; tests use a short one. */
  timeoutMs?: number;
}

const failed = (error: IndexError): EmbedResult => ({
  status: 'failed',
  error,
});

/** The error message from a JSON error body, or the status line when there is none. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null && 'error' in body) {
      if (typeof body.error === 'string') return body.error;
    }
    return text || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Maps Ollama's own error text to a code. "model ... not found, try pulling it first" is
 * what Ollama 0.34.0 answers (with status 404) for a model that is not installed; a bare
 * "404 page not found" is an Ollama without the embedding endpoint, which is a different
 * problem, so it stays a general failure.
 */
export function classifyEmbedError(
  message: string,
  status?: number,
): IndexError {
  const text = message.toLowerCase();
  if (
    /model.*(not found|does not exist)|try pulling/.test(text) ||
    (status === 404 && /model/.test(text))
  ) {
    return { code: 'model-not-found', detail: message };
  }
  return { code: 'embed-failed', detail: message };
}

/**
 * Checks Ollama's answer: an array with exactly one vector per text, each non-empty, made
 * of finite numbers, all of the same length. Returns the vectors, or why it is not usable.
 */
export function validateEmbeddings(
  body: unknown,
  expected: number,
): { ok: true; vectors: number[][] } | { ok: false; detail: string } {
  const embeddings =
    typeof body === 'object' && body !== null && 'embeddings' in body
      ? body.embeddings
      : undefined;
  if (!Array.isArray(embeddings))
    return { ok: false, detail: 'The answer has no list of vectors' };
  if (embeddings.length !== expected)
    return {
      ok: false,
      detail: `Expected ${expected} vectors but received ${embeddings.length}`,
    };

  let dimension = 0;
  for (const [position, vector] of embeddings.entries()) {
    if (!Array.isArray(vector) || vector.length === 0)
      return { ok: false, detail: `Vector ${position + 1} is empty` };
    if (!vector.every((value) => Number.isFinite(value)))
      return {
        ok: false,
        detail: `Vector ${position + 1} has a value that is not a number`,
      };
    if (position === 0) dimension = vector.length;
    else if (vector.length !== dimension)
      return { ok: false, detail: 'The vectors are not all the same length' };
  }
  return { ok: true, vectors: embeddings as number[][] };
}

/**
 * Embeds up to one batch of texts with `POST /api/embed` and never throws for an expected
 * outcome.
 *
 * - The answer is validated before it is returned, so callers never see a half-usable one.
 * - Aborting the signal gives `aborted`, not a failure.
 * - A refused, dropped or unanswered connection is `unreachable`.
 * - The texts leave only for the address the client was configured with.
 */
export async function embedTexts(
  client: OllamaClient,
  model: string,
  texts: readonly string[],
  options: EmbedOptions = {},
): Promise<EmbedResult> {
  const { signal, timeoutMs = EMBED_TIMEOUT_MS } = options;
  if (signal?.aborted) return { status: 'aborted' };
  if (texts.length === 0) return { status: 'ok', vectors: [] };

  // One controller covers both the caller's abort and the time limit, without relying on
  // `AbortSignal.any`, which older webviews lack.
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await client.request('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: controller.signal,
    });
    if (!response.ok)
      return failed(
        classifyEmbedError(await errorMessage(response), response.status),
      );

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return failed({
        code: 'embed-failed',
        detail: 'The answer is not valid JSON',
      });
    }
    const checked = validateEmbeddings(body, texts.length);
    if (!checked.ok)
      return failed({ code: 'embed-failed', detail: checked.detail });
    return { status: 'ok', vectors: checked.vectors };
  } catch (error) {
    if (signal?.aborted) return { status: 'aborted' };
    if (timedOut)
      return failed({
        code: 'unreachable',
        detail: 'Ollama did not answer in time',
      });
    return failed({
      code: 'unreachable',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
