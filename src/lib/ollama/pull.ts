import type { OllamaClient } from './client';
import { readNdjson } from './ndjson';
import { createProgressTracker, toPullEvent } from './progress';
import type { PullError, PullProgress, PullResult } from './types';

export interface PullOptions {
  /** Aborting this cancels the pull. Partly downloaded data is kept, so pulling again resumes. */
  signal?: AbortSignal;
  /** Called repeatedly while the model downloads. Errors thrown by it are ignored. */
  onProgress?: (progress: PullProgress) => void;
}

/**
 * Maps Ollama's own error text to a stable code. Disk space is checked first. The
 * "does not exist" wording is what Ollama 0.34.0 returns for an unknown model; the
 * disk-space wording is a best guess that could not be observed (it needs a full
 * disk), so anything unrecognised falls back to `pull-failed` with the message kept.
 */
export function classifyPullError(message: string): PullError {
  const text = message.toLowerCase();
  if (
    /no space left|not enough (disk )?space|insufficient (disk )?space|disk full/.test(
      text,
    )
  ) {
    return { code: 'insufficient-disk-space', detail: message };
  }
  if (
    /file does not exist|not found|unknown model|manifest unknown/.test(text)
  ) {
    return { code: 'model-not-found', detail: message };
  }
  return { code: 'pull-failed', detail: message };
}

const failed = (error: PullError): PullResult => ({ status: 'failed', error });

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
 * Downloads one model with `POST /api/pull`, streaming progress, and never throws for
 * an expected outcome.
 *
 * - Success ends with Ollama's `success` line.
 * - Aborting the signal gives `cancelled`, not a failure. Nothing is deleted, and
 *   Ollama keeps partial downloads, so calling this again continues where it stopped.
 * - Ollama reports most errors as a line inside an otherwise normal (HTTP 200) stream,
 *   so the stream is read line by line, not just the status code.
 * - A connection that is refused, drops, or ends before `success` is `unreachable`.
 */
export async function pullModel(
  client: OllamaClient,
  model: string,
  options: PullOptions = {},
): Promise<PullResult> {
  const { signal, onProgress } = options;
  if (signal?.aborted) return { status: 'cancelled' };

  const emit = (progress: PullProgress): void => {
    try {
      onProgress?.(progress);
    } catch {
      // A faulty progress listener must not break the download.
    }
  };

  try {
    const response = await client.request('/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal,
    });
    if (!response.ok)
      return failed(classifyPullError(await errorMessage(response)));
    if (!response.body)
      return failed({ code: 'pull-failed', detail: 'No response body' });

    const tracker = createProgressTracker();
    for await (const line of readNdjson(response.body)) {
      // Lines already buffered from one network chunk must not outlive a cancel.
      if (signal?.aborted) return { status: 'cancelled' };
      const event = toPullEvent(line);
      if (!event) continue;
      if (event.error !== undefined)
        return failed(classifyPullError(event.error));
      const progress = tracker.update(event);
      emit(progress);
      if (progress.phase === 'done') return { status: 'success' };
    }
    // The stream ended without `success` or an error: Ollama stopped answering.
    return failed({
      code: 'unreachable',
      detail: 'The download ended before it finished',
    });
  } catch (error) {
    if (signal?.aborted) return { status: 'cancelled' };
    return failed({
      code: 'unreachable',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
