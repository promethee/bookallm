import type { Page } from '@playwright/test';
import {
  buildEpub,
  type BuildEpubOptions,
} from '../src/lib/ingest/testing/epub-builder';
import { fakeEmbedding } from '../src/lib/ollama/testing/simulated-ollama';

/** A pretend Ollama the tests can change while the app is running. */
export interface MockOllama {
  /** Undefined means Ollama is not running: connections are refused. */
  version?: string;
  installed: string[];
  requests: { method: string; path: string; body?: string }[];
  /** After this many embed requests, further ones fail like a dropped connection. */
  embedDropAfter?: number;
  /** Milliseconds each embed answer is held back, so progress can be watched. */
  embedDelayMs?: number;
  /** How many embed requests have arrived. */
  embedCalls: number;
  /** Vectors to answer for exact texts; any other text gets the word-based fake vector. */
  embedFixed?: Record<string, number[]>;
  /** Scripted text chunks a chat answer streams, one ndjson line each. Overrides the default. */
  chatChunks?: string[];
  /** When set, the chat stream ends with this error line instead of a `done` line. */
  chatError?: string;
  /** Pause before each streamed chat chunk, in milliseconds. */
  chatDelayMs?: number;
  /** After this many chat requests, further ones fail like a dropped connection. */
  chatDropAfter?: number;
  /** How many chat requests have arrived. */
  chatCalls: number;
  /**
   * `/api/ps`'s running models. Undefined (the default) reports every installed model as
   * fully GPU-resident; set to `[]` or a specific list to test the hardware check itself.
   */
  runningModels?: { model: string; size: number; size_vram: number }[];
}

export const newMock = (overrides: Partial<MockOllama> = {}): MockOllama => ({
  installed: [],
  requests: [],
  embedCalls: 0,
  chatCalls: 0,
  ...overrides,
});

/** A deterministic default answer: echoes the question and cites the first passage. */
function defaultChatChunks(
  messages: { role: string; content: string }[],
): string[] {
  const question =
    messages.find((message) => message.role === 'user')?.content ?? '';
  return ['Answer: ', question, ' [1]'];
}

const withTag = (name: string) =>
  (name.includes(':') ? name : `${name}:latest`).toLowerCase();

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const ndjson = (...lines: unknown[]) =>
  lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/**
 * Answers every request the app makes to Ollama's default address, so a test never
 * depends on (or touches) a real Ollama, even if one is running on this machine.
 *
 * Also seeds the hardware check as already resolved (`hardwareCheckResolved: true`),
 * unless told otherwise, so a test that does not care about it is unaffected by its one
 * extra `/api/embed` request. Pass `hardwareCheckResolved: false` to test the check
 * itself.
 */
export async function mockOllama(
  page: Page,
  state: MockOllama,
  { hardwareCheckResolved = true }: { hardwareCheckResolved?: boolean } = {},
): Promise<void> {
  if (hardwareCheckResolved) {
    // Only seeds when nothing is saved yet: this runs on every navigation, including a
    // reload, and must never clobber settings the app has since saved for real.
    await page.addInitScript(() => {
      if (!localStorage.getItem('bookallm.settings')) {
        localStorage.setItem(
          'bookallm.settings',
          JSON.stringify({ version: 1, hardwareCheckResolved: true }),
        );
      }
    });
  }
  await page.route('http://127.0.0.1:11434/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });

    const { pathname } = new URL(request.url());
    state.requests.push({
      method: request.method(),
      path: pathname,
      body: request.postData() ?? undefined,
    });
    if (!state.version) return route.abort('connectionrefused');

    if (pathname === '/api/version') {
      return route.fulfill({ json: { version: state.version }, headers: cors });
    }
    if (pathname === '/api/tags') {
      return route.fulfill({
        json: { models: state.installed.map((name) => ({ name })) },
        headers: cors,
      });
    }
    if (pathname === '/api/ps') {
      const models =
        state.runningModels ??
        state.installed.map((name) => ({
          model: withTag(name),
          size: 1_000_000,
          size_vram: 1_000_000,
        }));
      return route.fulfill({ json: { models }, headers: cors });
    }
    if (pathname === '/api/embed') {
      const { model, input } = JSON.parse(request.postData() ?? '{}') as {
        model: string;
        input: string[];
      };
      state.embedCalls += 1;
      if (
        state.embedDropAfter !== undefined &&
        state.embedCalls > state.embedDropAfter
      )
        return route.abort('connectionrefused');
      if (state.embedDelayMs)
        await new Promise((resolve) => setTimeout(resolve, state.embedDelayMs));
      if (!state.installed.map(withTag).includes(withTag(model)))
        return route.fulfill({
          status: 404,
          json: { error: `model "${model}" not found, try pulling it first` },
          headers: cors,
        });
      return route.fulfill({
        json: {
          model,
          embeddings: input.map(
            (text) => state.embedFixed?.[text] ?? fakeEmbedding(text),
          ),
        },
        headers: cors,
      });
    }
    if (pathname === '/api/chat') {
      const { model, messages } = JSON.parse(request.postData() ?? '{}') as {
        model: string;
        messages: { role: string; content: string }[];
      };
      state.chatCalls += 1;
      if (
        state.chatDropAfter !== undefined &&
        state.chatCalls > state.chatDropAfter
      )
        return route.abort('connectionrefused');
      if (!state.installed.map(withTag).includes(withTag(model)))
        return route.fulfill({
          status: 404,
          json: { error: `model "${model}" not found, try pulling it first` },
          headers: cors,
        });
      const chunks = state.chatChunks ?? defaultChatChunks(messages);
      const lines = chunks.map((content) =>
        JSON.stringify({
          message: { role: 'assistant', content },
          done: false,
        }),
      );
      lines.push(
        state.chatError
          ? JSON.stringify({ error: state.chatError })
          : JSON.stringify({
              message: { role: 'assistant', content: '' },
              done: true,
            }),
      );
      if (state.chatDelayMs)
        await new Promise((resolve) => setTimeout(resolve, state.chatDelayMs));
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/x-ndjson' },
        body: lines.map((line) => `${line}\n`).join(''),
      });
    }
    if (pathname === '/api/pull') {
      const { model } = JSON.parse(request.postData() ?? '{}') as {
        model: string;
      };
      state.installed.push(model.includes(':') ? model : `${model}:latest`);
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/x-ndjson' },
        body: ndjson(
          { status: 'pulling manifest' },
          {
            status: 'pulling x',
            digest: 'd1',
            total: 100_000_000,
            completed: 40_000_000,
          },
          {
            status: 'pulling x',
            digest: 'd1',
            total: 100_000_000,
            completed: 100_000_000,
          },
          { status: 'verifying sha256 digest' },
          { status: 'writing manifest' },
          { status: 'success' },
        ),
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: 'not found' },
      headers: cors,
    });
  });
}

/** A small generated EPUB. `title` and `body` make different books. */
export function epubFile(
  title: string,
  body = 'Once upon a time.',
  extra: Partial<BuildEpubOptions> = {},
  name = 'book.epub',
) {
  const bytes = buildEpub({
    title,
    authors: ['Someone'],
    documents: [{ href: 'a.xhtml', body: `<h1>Start</h1><p>${body}</p>` }],
    toc: [{ title: 'Start', href: 'a.xhtml' }],
    ...extra,
  });
  return { name, mimeType: 'application/epub+zip', buffer: Buffer.from(bytes) };
}

/** A generated EPUB with `chapters` short chapters, each of which becomes one chunk. */
export function chaptersFile(
  title: string,
  chapters: number,
  name = 'book.epub',
) {
  const documents = Array.from({ length: chapters }, (_, index) => ({
    href: `c${index + 1}.xhtml`,
    body: `<h1>Chapter ${index + 1}</h1><p>Words of chapter ${index + 1} tell of event ${index + 1}.</p>`,
  }));
  return epubFile(
    title,
    '',
    {
      documents,
      toc: documents.map((document, index) => ({
        title: `Chapter ${index + 1}`,
        href: document.href,
      })),
    },
    name,
  );
}

/** A running, recent Ollama with both default models installed. */
export const READY = () =>
  newMock({ version: '0.34.0', installed: ['llama3.1:8b', 'bge-m3:latest'] });
