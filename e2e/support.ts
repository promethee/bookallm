import type { Page } from '@playwright/test';
import {
  buildEpub,
  type BuildEpubOptions,
} from '../src/lib/ingest/testing/epub-builder';

/** A pretend Ollama the tests can change while the app is running. */
export interface MockOllama {
  /** Undefined means Ollama is not running: connections are refused. */
  version?: string;
  installed: string[];
  requests: { method: string; path: string }[];
}

export const newMock = (overrides: Partial<MockOllama> = {}): MockOllama => ({
  installed: [],
  requests: [],
  ...overrides,
});

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
 */
export async function mockOllama(page: Page, state: MockOllama): Promise<void> {
  await page.route('http://127.0.0.1:11434/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });

    const { pathname } = new URL(request.url());
    state.requests.push({ method: request.method(), path: pathname });
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

/** A running, recent Ollama with both default models installed. */
export const READY = () =>
  newMock({ version: '0.34.0', installed: ['llama3.1:8b', 'bge-m3:latest'] });
