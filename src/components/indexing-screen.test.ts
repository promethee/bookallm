import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../lib/i18n';
import { indexBook } from '../lib/indexing';
import { makeIndexableBook } from '../lib/indexing/testing/books';
import { createOllamaClient } from '../lib/ollama';
import {
  simulateOllama,
  type OllamaState,
} from '../lib/ollama/testing/simulated-ollama';
import { CONTROLLER_KEY } from '../lib/onboarding/context';
import type { OnboardingController } from '../lib/onboarding/controller.svelte';
import {
  harness,
  READY,
  type HarnessOptions,
} from '../lib/onboarding/testing/harness';
import { MemoryLibrary } from '../lib/storage';
import IndexingScreen from './IndexingScreen.svelte';

const withController = (controller: OnboardingController) => ({
  context: new Map([[CONTROLLER_KEY, controller]]),
});

const bar = () => screen.getByRole('progressbar') as HTMLProgressElement;

/** A controller for a book that needs indexing; `state` decides how Ollama behaves. */
async function setup(
  state: OllamaState,
  options: HarnessOptions = {},
  counts = [3, 3, 3],
) {
  const book = makeIndexableBook(counts);
  return {
    book,
    ...(await harness(state, { language: 'en', books: [book], ...options })),
  };
}

/** A library where the first chapter of `book` is already indexed. */
async function halfIndexed(counts = [3, 3, 3]) {
  const book = makeIndexableBook(counts);
  const library = new MemoryLibrary();
  await library.saveBook(book);
  // One chunk per request: three requests save the first chapter of three chunks.
  const earlier = simulateOllama({ ...READY, embedDropAfter: 3 });
  await indexBook({
    book,
    model: 'bge-m3',
    client: createOllamaClient({ fetch: earlier.fetch }),
    store: library.vectors,
  });
  return { book, library };
}

describe('IndexingScreen: progress', () => {
  it('shows the book, the chapter, a readable progress bar and the one-time note', async () => {
    const { book, library } = await halfIndexed();
    const { controller } = await harness(
      { ...READY, embedStall: true },
      { language: 'en', library },
    );
    const started = controller.start();
    await vi.waitFor(() => expect(controller.indexState.kind).toBe('running'));

    render(IndexingScreen, withController(controller));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Getting to know your book',
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Preparing “A Test Book” so you can ask questions about it.',
      ),
    ).toBeTruthy();
    expect(await screen.findByText('Chapter 2 of 3')).toBeTruthy();
    expect(screen.getByText('Continuing where it stopped.')).toBeTruthy();
    expect(
      screen.getByText(
        /one-time step\. It can take from a few minutes to a few hours/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/You can close BookaLLM at any time/)).toBeTruthy();
    const progress = screen.getByRole('progressbar', {
      name: 'Preparation progress',
    }) as HTMLProgressElement;
    expect(progress.value).toBe(3);
    expect(progress.max).toBe(book.chunks.length);
    controller.destroy();
    await started;
  });

  it('says it is getting ready before the first numbers arrive', async () => {
    const { controller } = await setup({ ...READY });

    render(IndexingScreen, withController(controller));

    expect(screen.getByText('Getting ready…')).toBeTruthy();
    expect(bar().value).toBe(0);
    controller.destroy();
  });

  it('does not say it is continuing or rebuilding for a first index', async () => {
    const { controller } = await setup({ ...READY, embedStall: true });
    const started = controller.start();
    await vi.waitFor(() => expect(controller.indexState.kind).toBe('running'));

    render(IndexingScreen, withController(controller));

    await screen.findByText('Chapter 1 of 3');
    expect(screen.queryByText('Continuing where it stopped.')).toBeNull();
    expect(screen.queryByText(/search model was changed/)).toBeNull();
    controller.destroy();
    await started;
  });

  it('says the search model changed when it is a rebuild', async () => {
    const state: OllamaState = {
      ...READY,
      installed: [...READY.installed, 'nomic-embed-text:latest'],
    };
    const { controller } = await setup(state, { indexed: true });
    await controller.start();
    state.embedStall = true;
    const pending = controller.editModels({
      chat: 'llama3.1:8b',
      embedding: 'nomic-embed-text',
    });
    await vi.waitFor(() => expect(controller.indexState.kind).toBe('running'));

    render(IndexingScreen, withController(controller));

    expect(
      await screen.findByText(
        'The search model was changed, so BookaLLM is getting to know this book again.',
      ),
    ).toBeTruthy();
    controller.destroy();
    await pending;
  });
});

describe('IndexingScreen: failures', () => {
  it('says Ollama seems to have stopped and offers to try again', async () => {
    const { controller } = await setup({ ...READY, embedDropAfter: 0 });
    await controller.start();

    render(IndexingScreen, withController(controller));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Ollama seems to have stopped.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    controller.destroy();
  });

  it('asks the reader to free some space when there is no room', async () => {
    const { controller } = await setup({ ...READY });
    controller.indexState = { kind: 'failed', error: { code: 'storage-full' } };

    render(IndexingScreen, withController(controller));

    expect(screen.getByRole('alert').textContent).toContain(
      'There is not enough room to save this book. Free up some space',
    );
  });

  it('asks the reader to check the search model name', async () => {
    const { controller } = await setup({ ...READY });
    await controller.start();
    controller.indexState = {
      kind: 'failed',
      error: { code: 'model-not-found' },
    };

    render(IndexingScreen, withController(controller));

    expect(screen.getByRole('alert').textContent).toContain(
      'Ollama does not have a model called “bge-m3”. Check the name of the search model',
    );
    controller.destroy();
  });

  it('says the book could not be prepared and keeps Ollama’s message under details', async () => {
    const { controller } = await setup({ ...READY, embedWrongCount: true });
    await controller.start();

    render(IndexingScreen, withController(controller));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The book could not be prepared.',
    );
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Expected');
    controller.destroy();
  });

  it('keeps what was done and finishes when the reader presses try again', async () => {
    // Three requests save the first chapter of three chunks; the fourth fails.
    const state: OllamaState = { ...READY, embedDropAfter: 3 };
    const { controller, library, book } = await setup(state);
    await controller.start();
    render(IndexingScreen, withController(controller));
    expect((await screen.findByRole('alert')).textContent).toContain('Ollama');
    state.embedDropAfter = undefined;

    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(controller.screen).toBe('landing'));
    expect(
      (await library.vectors.savedChapters(book.hash, 'bge-m3:latest')).length,
    ).toBe(3);
    controller.destroy();
  });
});

describe('IndexingScreen: in French', () => {
  it('shows French words and numbers for a resumed index', async () => {
    const { library } = await halfIndexed();
    const { controller } = await harness(
      { ...READY, embedStall: true },
      { language: 'fr', library },
    );
    const started = controller.start();
    await vi.waitFor(() => expect(controller.indexState.kind).toBe('running'));

    render(IndexingScreen, withController(controller));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'BookaLLM fait connaissance avec votre livre',
      }),
    ).toBeTruthy();
    expect(await screen.findByText('Chapitre 2 sur 3')).toBeTruthy();
    expect(
      screen.getByText('Reprise là où la préparation s’était arrêtée.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('progressbar', {
        name: 'Progression de la préparation',
      }),
    ).toBeTruthy();
    controller.destroy();
    await started;
  });

  it('shows a French failure with a French retry button', async () => {
    const { controller } = await harness(
      { ...READY, embedDropAfter: 0 },
      { language: 'fr', books: [makeIndexableBook([2])] },
    );
    await controller.start();

    render(IndexingScreen, withController(controller));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Ollama semble s’être arrêté.',
    );
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    controller.destroy();
  });
});

describe('IndexingScreen: the time left', () => {
  /** Shows the screen in a running state with the given time left. */
  async function running(
    remainingMs: number | undefined,
    language: 'en' | 'fr' = 'en',
  ) {
    const { controller } = await setup({ ...READY }, { language });
    // The language is applied when the app starts; this screen is shown on its own.
    setLanguage(language);
    controller.indexState = {
      kind: 'running',
      resumed: false,
      rebuild: false,
      progress: {
        chapterPosition: 3,
        chapterTotal: 10,
        chunksDone: 20,
        chunksTotal: 100,
      },
      remainingMs,
    };
    render(IndexingScreen, withController(controller));
    return controller;
  }

  const MINUTE = 60_000;

  it('says it is working out how long this will take until there is an estimate', async () => {
    const controller = await running(undefined);

    expect(
      screen.getByText('Working out how long this will take…'),
    ).toBeTruthy();
    expect(screen.queryByText(/left\./)).toBeNull();
    controller.destroy();
  });

  it('shows a rounded estimate in minutes', async () => {
    const controller = await running(24 * MINUTE);

    expect(screen.getByText('About 25 minutes left.')).toBeTruthy();
    expect(
      screen.queryByText('Working out how long this will take…'),
    ).toBeNull();
    controller.destroy();
  });

  it('shows hours and minutes on a slow computer', async () => {
    const controller = await running(272 * MINUTE);

    expect(screen.getByText('About 4 hours 30 minutes left.')).toBeTruthy();
    controller.destroy();
  });

  it('says less than a minute is left when it is almost done', async () => {
    const controller = await running(20_000);

    expect(screen.getByText('Less than a minute left.')).toBeTruthy();
    controller.destroy();
  });

  it('shows the estimate in French', async () => {
    const controller = await running(272 * MINUTE, 'fr');

    expect(
      screen.getByText('Il reste environ 4 heures 30 minutes.'),
    ).toBeTruthy();
    controller.destroy();
  });

  it('says the French words while working it out and when almost done', async () => {
    const first = await running(undefined, 'fr');
    expect(screen.getByText('Estimation de la durée…')).toBeTruthy();
    first.destroy();
    cleanup();

    const second = await running(10_000, 'fr');
    expect(screen.getByText('Il reste moins d’une minute.')).toBeTruthy();
    second.destroy();
  });

  it('says how long it can take, in French too', async () => {
    const controller = await running(undefined, 'fr');

    expect(
      screen.getByText(/Elle peut durer de quelques minutes à quelques heures/),
    ).toBeTruthy();
    controller.destroy();
  });
});

describe('IndexingScreen: percentage and activity', () => {
  async function showing(
    chunksDone: number,
    chunksTotal: number,
    language: 'en' | 'fr' = 'en',
    kind: 'running' | 'failed' = 'running',
  ) {
    const { controller } = await setup({ ...READY }, { language });
    setLanguage(language);
    controller.indexState =
      kind === 'running'
        ? {
            kind: 'running',
            resumed: false,
            rebuild: false,
            progress: {
              chapterPosition: 2,
              chapterTotal: 5,
              chunksDone,
              chunksTotal,
            },
          }
        : { kind: 'failed', error: { code: 'unreachable' } };
    render(IndexingScreen, withController(controller));
    return controller;
  }

  const bodyText = () => document.body.textContent!.replace(/\s/g, ' ');

  it('shows the share of chunks done with two decimals', async () => {
    const controller = await showing(1374, 10_000);

    expect(bodyText()).toContain('13.74%');
    controller.destroy();
  });

  it('follows every finished chunk', async () => {
    const controller = await showing(90, 657);
    expect(bodyText()).toContain('13.69%');
    controller.destroy();
    cleanup();

    const next = await showing(91, 657);
    expect(bodyText()).toContain('13.85%');
    next.destroy();
  });

  it('never shows 100.00% before the work is done', async () => {
    const controller = await showing(656, 657);

    expect(bodyText()).toContain('99.84%');
    expect(bodyText()).not.toContain('100.00%');
    controller.destroy();
  });

  it('starts at 0.00% before any chunk is done', async () => {
    const { controller } = await setup({ ...READY });
    render(IndexingScreen, withController(controller));

    expect(bodyText()).toContain('0.00%');
    controller.destroy();
  });

  it('writes the percentage the French way', async () => {
    const controller = await showing(1374, 10_000, 'fr');

    expect(bodyText()).toContain('13,74 %');
    controller.destroy();
  });

  it('shows an activity animation that assistive technology skips, and stops it for reduced motion', async () => {
    const controller = await showing(10, 100);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner!.getAttribute('aria-hidden')).toBe('true');
    expect(spinner!.className).toContain('motion-reduce:animate-none');
    controller.destroy();
  });

  it('shows no animation once it has failed', async () => {
    const controller = await showing(10, 100, 'en', 'failed');

    expect(document.querySelector('.animate-spin')).toBeNull();
    controller.destroy();
  });
});
