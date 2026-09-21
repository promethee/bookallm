import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  /** Base URL, e.g. `http://127.0.0.1:53123`. */
  url: string;
  close(): Promise<void>;
}

/** Starts a real HTTP server on a free local port, for behavior a fake `fetch` cannot reproduce. */
export async function startTestServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>,
): Promise<TestServer> {
  const server: Server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch(() =>
      response.destroy(),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Writes chunks one at a time with a pause between them, then ends the response. */
export async function sendChunks(
  response: ServerResponse,
  chunks: string[],
  options: { delayMs?: number; status?: number; end?: boolean } = {},
): Promise<void> {
  const { delayMs = 10, status = 200, end = true } = options;
  response.writeHead(status, { 'Content-Type': 'application/x-ndjson' });
  for (const chunk of chunks) {
    response.write(chunk);
    await sleep(delayMs);
  }
  if (end) response.end();
}
