import type { OllamaClient } from '../ollama';
import { readNdjson } from '../ollama/ndjson';
import {
  CHAT_CONTEXT_LENGTH,
  CHAT_MAX_ANSWER_TOKENS,
  CHAT_PRE_STREAM_RETRIES,
  CHAT_RETRY_BACKOFF_MS,
  CHAT_STREAM_TIMEOUT_MS,
} from './defaults';
import type { AnswerError } from './types';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatStreamOptions {
  /** Aborting this stops the stream; the generator ends quietly, with no error. */
  signal?: AbortSignal;
  /** Replaces `CHAT_STREAM_TIMEOUT_MS`; reset on every piece of text received. */
  timeoutMs?: number;
  /** Replaces `CHAT_PRE_STREAM_RETRIES`. */
  retries?: number;
}

export type ChatStreamResult =
  /** `chunks` yields the answer's text in order. Iterating it can throw an `AnswerError`. */
  | { status: 'ok'; chunks: AsyncGenerator<string, void, undefined> }
  | { status: 'aborted' }
  | { status: 'failed'; error: AnswerError };

const failed = (error: AnswerError): ChatStreamResult => ({
  status: 'failed',
  error,
});

const isAnswerError = (value: unknown): value is AnswerError =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  typeof (value as { code: unknown }).code === 'string';

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
 * Maps Ollama's own error text to a code, the same way `classifyEmbedError` does: a
 * missing-model message (with status 404) is `model-not-found`; anything else keeps
 * Ollama's message as `chat-failed`.
 */
export function classifyChatError(
  message: string,
  status?: number,
): AnswerError {
  const text = message.toLowerCase();
  if (
    /model.*(not found|does not exist)|try pulling/.test(text) ||
    (status === 404 && /model/.test(text))
  ) {
    return { code: 'model-not-found', detail: message };
  }
  return { code: 'chat-failed', detail: message };
}

/** The fields of one line of Ollama's chat stream that this module reads. */
export interface ChatEvent {
  content?: string;
  done?: boolean;
  error?: string;
}

/** Picks the known fields out of a parsed stream line, ignoring anything else. */
export function toChatEvent(value: unknown): ChatEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const event: ChatEvent = {};
  if (typeof raw.error === 'string') event.error = raw.error;
  if (typeof raw.done === 'boolean') event.done = raw.done;
  const message = raw.message;
  if (typeof message === 'object' && message !== null) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === 'string') event.content = content;
  }
  return event;
}

async function* readChatBody(
  body: ReadableStream<Uint8Array>,
  ctx: {
    touch: () => void;
    cleanup: () => void;
    callerAborted: () => boolean;
    timedOut: () => boolean;
  },
): AsyncGenerator<string, void, undefined> {
  try {
    for await (const line of readNdjson(body)) {
      ctx.touch();
      const event = toChatEvent(line);
      if (!event) continue;
      if (event.error !== undefined) throw classifyChatError(event.error);
      if (event.content) yield event.content;
      if (event.done) return;
    }
    if (ctx.callerAborted()) return;
    // The stream ended without a `done` line: Ollama stopped answering.
    throw {
      code: 'unreachable',
      detail: 'The answer ended before it finished',
    } satisfies AnswerError;
  } catch (error) {
    if (ctx.callerAborted()) return;
    if (isAnswerError(error)) throw error;
    if (ctx.timedOut())
      throw {
        code: 'unreachable',
        detail: 'Ollama did not answer in time',
      } satisfies AnswerError;
    throw {
      code: 'unreachable',
      detail: error instanceof Error ? error.message : String(error),
    } satisfies AnswerError;
  } finally {
    ctx.cleanup();
  }
}

/** Resolves after `ms`, or as soon as `signal` aborts, whichever comes first. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * One request to `/api/chat`. Never throws for an expected outcome before any text
 * arrives; once streaming starts, a failure surfaces by the returned generator throwing.
 * `ok` is only returned once the first piece of text has actually arrived, so a caller
 * that only retries `unreachable` failures never discards text it already showed.
 */
async function attemptChat(
  client: OllamaClient,
  model: string,
  messages: readonly ChatMessage[],
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ChatStreamResult> {
  // One controller drives the real fetch/stream abort, for both the caller's signal and
  // this module's own resettable inactivity timeout.
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const touch = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  const cleanup = (): void => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  };

  let response: Response;
  try {
    response = await client.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          num_ctx: CHAT_CONTEXT_LENGTH,
          num_predict: CHAT_MAX_ANSWER_TOKENS,
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    cleanup();
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
  }

  if (!response.ok) {
    cleanup();
    return failed(
      classifyChatError(await errorMessage(response), response.status),
    );
  }
  if (!response.body) {
    cleanup();
    return failed({ code: 'chat-failed', detail: 'No response body' });
  }

  const body = readChatBody(response.body, {
    touch,
    cleanup,
    callerAborted: () => signal?.aborted ?? false,
    timedOut: () => timedOut,
  });

  let first: IteratorResult<string, void>;
  try {
    first = await body.next();
  } catch (error) {
    if (signal?.aborted) return { status: 'aborted' };
    return failed(
      isAnswerError(error)
        ? error
        : { code: 'unreachable', detail: String(error) },
    );
  }
  if (signal?.aborted) return { status: 'aborted' };
  // The stream ended (e.g. an immediate `done`) with no content and no error: an empty
  // but genuine answer, not a dropped connection, so nothing to retry.
  if (first.done) return { status: 'ok', chunks: (async function* () {})() };
  return { status: 'ok', chunks: resume(first.value, body) };
}

/** Replays an already-pulled first value, then the rest of `source`. */
async function* resume(
  first: string,
  source: AsyncGenerator<string, void, undefined>,
): AsyncGenerator<string, void, undefined> {
  yield first;
  yield* source;
}

/**
 * Streams a chat answer from `POST /api/chat` and never throws for an expected outcome
 * before any text arrives.
 *
 * - If the connection drops before any answer text has arrived, the attempt is retried
 *   from scratch (`CHAT_PRE_STREAM_RETRIES` times, by default), since nothing has been
 *   shown yet to discard. A real, informative failure (a missing model, an explicit error
 *   from Ollama) is never retried, since trying again cannot change that answer.
 * - Once streaming starts, a failure (Ollama drops, a stream that stalls past the
 *   timeout, an error line) surfaces by the returned generator throwing an `AnswerError`,
 *   since some text may already have reached the caller and cannot be un-shown.
 * - Aborting `signal`, before, between attempts, or during the stream, ends the generator
 *   quietly: iterating it simply stops, with no error and no further text.
 * - The inactivity timeout resets on every piece of text received, so a real but slow
 *   answer is not mistaken for a stopped one; it applies fresh to each attempt.
 * - Requests a smaller context window than the model's own default
 *   (`CHAT_CONTEXT_LENGTH`) and caps the answer's length (`CHAT_MAX_ANSWER_TOKENS`), so a
 *   CPU-only machine is not made to allocate far more than this app's prompts ever need.
 */
export async function streamChat(
  client: OllamaClient,
  model: string,
  messages: readonly ChatMessage[],
  options: ChatStreamOptions = {},
): Promise<ChatStreamResult> {
  const {
    signal,
    timeoutMs = CHAT_STREAM_TIMEOUT_MS,
    retries = CHAT_PRE_STREAM_RETRIES,
  } = options;
  if (signal?.aborted) return { status: 'aborted' };

  let lastFailure: ChatStreamResult = failed({
    code: 'unreachable',
    detail: 'Ollama did not answer',
  });
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await delay(CHAT_RETRY_BACKOFF_MS, signal);
      if (signal?.aborted) return { status: 'aborted' };
    }
    const result = await attemptChat(
      client,
      model,
      messages,
      signal,
      timeoutMs,
    );
    if (result.status !== 'failed' || result.error.code !== 'unreachable')
      return result;
    lastFailure = result;
  }
  return lastFailure;
}
