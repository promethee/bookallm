/** A request as seen by a fake handler. */
export interface RecordedRequest {
  method: string;
  /** Path and query, e.g. `/api/pull`. */
  path: string;
  body?: string;
}

export type FakeHandler = (
  request: RecordedRequest,
  signal: AbortSignal | undefined,
) => Response | Promise<Response>;

export interface FakeFetch {
  fetch: typeof fetch;
  /** Every request made, in order. */
  requests: RecordedRequest[];
}

const abortError = (): DOMException =>
  new DOMException('The operation was aborted', 'AbortError');

/**
 * A stand-in for `fetch`. Routes are keyed `"<METHOD> <path>"`. A request with no
 * matching route fails like a refused connection (a `TypeError`), and an already-aborted
 * signal fails like a real abort.
 */
export function createFakeFetch(
  routes: Record<string, FakeHandler>,
): FakeFetch {
  const requests: RecordedRequest[] = [];
  const fakeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input : input.url,
    );
    const request: RecordedRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname + url.search,
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    requests.push(request);
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) throw signal.reason ?? abortError();
    const handler = routes[`${request.method} ${url.pathname}`];
    if (!handler) throw new TypeError('fetch failed');
    return handler(request, signal);
  };
  return { fetch: fakeFetch as typeof fetch, requests };
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Newline-delimited JSON, the format Ollama streams pulls in. */
export const ndjson = (...objects: unknown[]): string =>
  objects.map((object) => `${JSON.stringify(object)}\n`).join('');

export interface StreamOptions {
  /** Pause before each chunk, in milliseconds. */
  delayMs?: number;
  /** Aborting this signal errors the stream, as a cancelled request would. */
  signal?: AbortSignal;
  /** Error the stream after the chunks instead of closing it (a dropped connection). */
  failWith?: Error;
  /** Leave the stream open after the chunks until the signal aborts (a stalled download). */
  stall?: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A response whose body arrives as the given text chunks, exactly as split. */
export function streamResponse(
  chunks: string[],
  options: StreamOptions = {},
): Response {
  const encoder = new TextEncoder();
  const { delayMs = 0, signal, failWith, stall } = options;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const onAbort = (): void =>
        controller.error(signal?.reason ?? abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        for (const chunk of chunks) {
          if (delayMs > 0) await sleep(delayMs);
          if (signal?.aborted) return;
          controller.enqueue(encoder.encode(chunk));
        }
        if (failWith) controller.error(failWith);
        else if (!stall) controller.close();
      } catch {
        // The stream was already errored by an abort.
      }
    },
  });
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

/** Never answers; rejects only when the signal aborts or times out. */
export const neverAnswers: FakeHandler = (_request, signal) =>
  new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener(
      'abort',
      () => reject(signal.reason ?? abortError()),
      { once: true },
    );
  });

/** Reads a whole response body as text, chunk by chunk. */
export async function readChunks(response: Response): Promise<string[]> {
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  const reader = response.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(decoder.decode(value, { stream: true }));
  }
}
