import type { OllamaClient } from '../ollama';
import { readNdjson } from '../ollama/ndjson';
import { CHAT_STREAM_TIMEOUT_MS } from './defaults';
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

/**
 * Streams a chat answer from `POST /api/chat` and never throws for an expected outcome
 * before any text arrives.
 *
 * - Once streaming starts, a failure (Ollama drops, a stream that stalls past the
 *   timeout, an error line) surfaces by the returned generator throwing an `AnswerError`,
 *   since some text may already have reached the caller and cannot be un-shown.
 * - Aborting `signal`, before or during the stream, ends the generator quietly: iterating
 *   it simply stops, with no error and no further text.
 * - The inactivity timeout resets on every piece of text received, so a real but slow
 *   answer is not mistaken for a stopped one.
 */
export async function streamChat(
  client: OllamaClient,
  model: string,
  messages: readonly ChatMessage[],
  options: ChatStreamOptions = {},
): Promise<ChatStreamResult> {
  const { signal, timeoutMs = CHAT_STREAM_TIMEOUT_MS } = options;
  if (signal?.aborted) return { status: 'aborted' };

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
      body: JSON.stringify({ model, messages, stream: true }),
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

  return {
    status: 'ok',
    chunks: readChatBody(response.body, {
      touch,
      cleanup,
      callerAborted: () => signal?.aborted ?? false,
      timedOut: () => timedOut,
    }),
  };
}
