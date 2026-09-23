import { setLanguage, type Language } from '../../i18n';
import { ingestEpub, InMemoryRegistry, type Book } from '../../ingest';
import {
  buildEpub,
  type BuildEpubOptions,
} from '../../ingest/testing/epub-builder';
import { indexBook } from '../../indexing';
import { createOllamaClient } from '../../ollama';
import {
  simulateOllama,
  type OllamaState,
} from '../../ollama/testing/simulated-ollama';
import {
  MemoryLibrary,
  MemorySettings,
  type AppStorage,
  type BookLibrary,
} from '../../storage';
import { OnboardingController } from '../controller.svelte';
import type { Services } from '../services';

/** A simulated Ollama that is running, recent and has both default models. */
export const READY: OllamaState = {
  version: '0.34.0',
  installed: ['llama3.1:8b', 'bge-m3:latest'],
};

/** A small EPUB; `title` and `body` make different books. */
export const epub = (
  title: string,
  body = 'Once upon a time.',
  extra: Partial<BuildEpubOptions> = {},
) =>
  buildEpub({
    title,
    authors: ['Someone'],
    documents: [{ href: 'a.xhtml', body: `<h1>Start</h1><p>${body}</p>` }],
    toc: [{ title: 'Start', href: 'a.xhtml' }],
    ...extra,
  });

export const file = (bytes: Uint8Array, name = 'book.epub') =>
  new File([bytes as BlobPart], name);

export async function bookOf(title: string, body?: string): Promise<Book> {
  const result = await ingestEpub(epub(title, body), {
    registry: new InMemoryRegistry(),
  });
  if (result.status !== 'new') throw new Error('expected a new book');
  return result.book;
}

/** Saves vectors for a book, as if the app had indexed it with the default embedding model. */
export async function indexWithDefaults(
  library: BookLibrary,
  book: Book,
): Promise<void> {
  const fake = simulateOllama({
    version: '0.34.0',
    installed: [READY.installed[1]],
  });
  await indexBook({
    book,
    model: READY.installed[1],
    client: createOllamaClient({ fetch: fake.fetch }),
    store: library.vectors,
  });
}

export interface HarnessOptions {
  language?: Language;
  systemLanguages?: string[];
  books?: Book[];
  /** Also index every book in `books` with the default embedding model. */
  indexed?: boolean;
  library?: BookLibrary;
  ingest?: Services['ingest'];
  nextFrame?: Services['nextFrame'];
  now?: Services['now'];
  platform?: Services['platform'];
  /**
   * Whether the hardware acceleration check is already resolved, so it does not run
   * (and its one `/api/embed` call does not compete with a test's own embed budget).
   * Defaults to true: most tests do not care about this check. Pass `false` to test the
   * check itself.
   */
  hardwareCheckResolved?: boolean;
}

/**
 * A controller wired to a simulated Ollama and in-memory storage, plus the pieces a
 * test wants to look at.
 */
export async function harness(
  ollama: OllamaState,
  options: HarnessOptions = {},
) {
  setLanguage('en');
  const fake = simulateOllama(ollama);
  const settings = new MemorySettings();
  if (options.language) settings.save({ language: options.language });
  settings.save({
    hardwareCheckResolved: options.hardwareCheckResolved ?? true,
  });
  const library = options.library ?? new MemoryLibrary();
  for (const book of options.books ?? []) {
    await library.saveBook(book);
    if (options.indexed) await indexWithDefaults(library, book);
  }
  const storage: AppStorage = { settings, library, booksProblem: undefined };
  const opened: string[] = [];
  const services: Services = {
    storage,
    createClient: (baseUrl) =>
      createOllamaClient({ fetch: fake.fetch, baseUrl }),
    platform: options.platform ?? 'windows',
    openExternal: async (url) => {
      opened.push(url);
      return true;
    },
    systemLanguages: options.systemLanguages ?? ['en-US'],
    ingest: options.ingest ?? ingestEpub,
    pollIntervalMs: 3000,
    nextFrame: options.nextFrame ?? (async () => undefined),
    now: options.now ?? (() => Date.now()),
  };
  const controller = new OnboardingController(services);
  return { controller, services, fake, storage, library, settings, opened };
}

export const versionRequests = (fake: ReturnType<typeof simulateOllama>) =>
  fake.requests.filter((r) => r.path === '/api/version').length;
