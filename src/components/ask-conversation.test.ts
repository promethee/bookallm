import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../lib/i18n';
import { ingestEpub, InMemoryRegistry } from '../lib/ingest';
import { CONTROLLER_KEY } from '../lib/onboarding/context';
import type { OnboardingController } from '../lib/onboarding/controller.svelte';
import {
  epub,
  harness,
  READY,
  type HarnessOptions,
} from '../lib/onboarding/testing/harness';
import {
  DEFAULT_EMBED_DIMENSION,
  type OllamaState,
} from '../lib/ollama/testing/simulated-ollama';
import AskConversation from './AskConversation.svelte';

const withController = (controller: OnboardingController) => ({
  context: new Map([[CONTROLLER_KEY, controller]]),
});

/**
 * A book whose sole chunk is exactly `text`, with no heading glued to it, so the text has
 * no embedded newline: an `<input>` cannot hold one, so a question built from a chunk
 * that did have one would not be the same string once typed into the field.
 */
async function plainBook(text: string) {
  const result = await ingestEpub(
    epub('Candide', undefined, {
      documents: [{ href: 'a.xhtml', body: `<p>${text}</p>` }],
      toc: [{ title: 'Candide', href: 'a.xhtml' }],
    }),
    { registry: new InMemoryRegistry() },
  );
  if (result.status !== 'new') throw new Error('expected a new book');
  return result.book;
}

/** A controller with one ready, indexed book whose sole chunk is `text`. */
async function ready(
  state: OllamaState,
  options: HarnessOptions = {},
  text = 'The old lighthouse keeper watched the storm from his window every single night.',
) {
  const book = await plainBook(text);
  const context = await harness(state, {
    language: 'en',
    books: [book],
    indexed: true,
    ...options,
  });
  await context.controller.start();
  return { ...context, book };
}

const ask = (question: string) => {
  fireEvent.input(screen.getByLabelText('Your question'), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
};

describe('AskConversation: asking a question', () => {
  it('shows the streamed answer and its citation once it completes', async () => {
    const { controller, book } = await ready({ ...READY });
    render(AskConversation, withController(controller));
    const question = book.chunks[0].text;

    ask(question);

    expect(await screen.findByText(question)).toBeTruthy();
    await waitFor(() => expect(controller.turns[0]?.state).toBe('done'));
    expect(screen.getByText(`Answer: ${question} [1]`)).toBeTruthy();
    expect(screen.getByText('Sources')).toBeTruthy();
    expect(screen.getByText('[1] Candide')).toBeTruthy();
    controller.destroy();
  });

  it('says getting ready before the first piece of text arrives', async () => {
    const { controller, book } = await ready({
      ...READY,
      chatStall: true,
    });
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);

    expect(
      await screen.findByText(
        'Getting the AI ready. The first answer can take a few minutes.',
      ),
    ).toBeTruthy();
    controller.destroy();
  });

  it('disables the question field while an answer is being generated', async () => {
    const { controller, book } = await ready({ ...READY, chatStall: true });
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);

    await waitFor(() =>
      expect(
        (screen.getByLabelText('Your question') as HTMLInputElement).disabled,
      ).toBe(true),
    );
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
    controller.destroy();
  });

  it('does nothing for an empty question', async () => {
    const { controller } = await ready({ ...READY });
    render(AskConversation, withController(controller));

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(controller.turns).toEqual([]);
    controller.destroy();
  });
});

describe('AskConversation: stopping and retrying', () => {
  it('stops an answer and keeps the partial text', async () => {
    const { controller, book } = await ready({
      ...READY,
      chatStallAfterChunks: 1,
    });
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);
    await waitFor(() => expect(controller.turns[0]?.state).toBe('streaming'));
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ask' })).toBeTruthy(),
    );
    expect(controller.turns[0]).toMatchObject({ state: 'done', stopped: true });
    expect(controller.turns[0].text.length).toBeGreaterThan(0);
    controller.destroy();
  });

  it('shows a failed turn with a retry that succeeds', async () => {
    const state: OllamaState = { ...READY, chatDropAfter: 0 };
    const { controller, book } = await ready(state);
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Ollama seems to have stopped');
    state.chatDropAfter = undefined;

    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(controller.turns[0].state).toBe('done'));
    expect(screen.queryByRole('alert')).toBeNull();
    controller.destroy();
  });

  it('shows the model-not-found and other-failure messages', async () => {
    const { controller, book } = await ready({
      ...READY,
      installed: ['bge-m3:latest'],
    });
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Ollama does not have one of the configured models anymore',
    );
    controller.destroy();
  });

  it('shows the other-failure message with details', async () => {
    const { controller, book } = await ready({
      ...READY,
      chatError: 'boom',
      chatChunks: [],
    });
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('This question could not be answered.');
    expect(alert.textContent).toContain('Details');
    expect(alert.textContent).toContain('boom');
    controller.destroy();
  });
});

describe('AskConversation: keyboard and announcements', () => {
  it('reaches the field, submit, stop and retry by keyboard alone', async () => {
    const state: OllamaState = { ...READY, chatDropAfter: 0 };
    const { controller, book } = await ready(state);
    render(AskConversation, withController(controller));

    const field = screen.getByLabelText('Your question');
    expect(field.tabIndex).not.toBe(-1);
    const submit = screen.getByRole('button', { name: 'Ask' });
    expect(submit.tagName).toBe('BUTTON');

    ask(book.chunks[0].text);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(retry.tagName).toBe('BUTTON');
    controller.destroy();
  });

  it('announces only once the answer completes, not on every streamed piece', async () => {
    const { controller, book } = await ready({
      ...READY,
      chatChunks: ['one', 'two', 'three'],
      chatDelayMs: 5,
    });
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);
    await waitFor(() => expect(screen.getByText(/one/)).toBeTruthy());
    expect(controller.announcement).toBeUndefined();

    await waitFor(() =>
      expect(controller.announcement).toEqual({
        key: 'announce.answerDone',
        params: undefined,
      }),
    );
    controller.destroy();
  });

  it('announces a failure', async () => {
    const { controller, book } = await ready({
      ...READY,
      chatDropAfter: 0,
    });
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);

    await waitFor(() =>
      expect(controller.announcement).toEqual({
        key: 'announce.answerFailed',
        params: undefined,
      }),
    );
    controller.destroy();
  });
});

describe('AskConversation: in French', () => {
  it('shows the French text throughout a full turn', async () => {
    setLanguage('fr');
    const { controller, book } = await ready({ ...READY }, { language: 'fr' });
    render(AskConversation, withController(controller));

    expect(screen.getByLabelText('Votre question')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Votre question'), {
      target: { value: book.chunks[0].text },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }));

    await waitFor(() => expect(screen.getByText('Sources')).toBeTruthy());
    controller.destroy();
  });

  it('shows a French failure with a French retry button', async () => {
    setLanguage('fr');
    const { controller, book } = await ready(
      { ...READY, chatDropAfter: 0 },
      { language: 'fr' },
    );
    render(AskConversation, withController(controller));

    fireEvent.input(screen.getByLabelText('Votre question'), {
      target: { value: book.chunks[0].text },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Ollama semble s’être arrêté',
    );
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    controller.destroy();
  });
});

const UNRELATED = 'zebra quantum xylophone';
/** Fake embeddings are never negative, so this vector finds nothing relevant anywhere. */
const AWAY = new Array<number>(DEFAULT_EMBED_DIMENSION).fill(
  -1 / Math.sqrt(DEFAULT_EMBED_DIMENSION),
);

/**
 * A ready book with an introduction, an empty section and two chapters, where the
 * unrelated question finds nothing. `second` is the last chapter's text; blank lines in
 * it become separate paragraphs.
 */
async function recoverable(
  overrides: Partial<OllamaState> = {},
  options: HarnessOptions = {},
  second = 'Candide reached Lisbon just before the earthquake struck the city.',
) {
  const result = await ingestEpub(
    epub('Candide', undefined, {
      documents: [
        { href: 'a.xhtml', body: '<p>A note on the printing history.</p>' },
        { href: 'b.xhtml', body: '' },
        { href: 'c.xhtml', body: '<p>The lighthouse keeper watched.</p>' },
        {
          href: 'd.xhtml',
          body: second
            .split('\n\n')
            .map((paragraph) => `<p>${paragraph}</p>`)
            .join(''),
        },
      ],
      toc: [
        { title: 'Introduction', href: 'a.xhtml' },
        { title: 'Illustrations', href: 'b.xhtml' },
        { title: 'Chapter 1', href: 'c.xhtml' },
        { title: 'Chapter 2', href: 'd.xhtml' },
      ],
    }),
    { registry: new InMemoryRegistry() },
  );
  if (result.status !== 'new') throw new Error('expected a new book');
  const book = result.book;
  const context = await harness(
    { ...READY, embedFixed: { [UNRELATED]: AWAY }, ...overrides },
    { language: 'en', books: [book], indexed: true, ...options },
  );
  await context.controller.start();
  return { ...context, book };
}

/** Asks the unrelated question and waits for its nothing-found reply. */
async function askNothingFound(controller: OnboardingController) {
  ask(UNRELATED);
  await waitFor(() =>
    expect(controller.turns[0]?.verdict).toBe('nothing-relevant'),
  );
}

function chooseChapter(
  title: string,
  label = 'Chapter',
  action = 'Look in this chapter',
) {
  const select = screen.getByLabelText(label) as HTMLSelectElement;
  const option = [...select.options].find((o) => o.textContent === title)!;
  fireEvent.change(select, { target: { value: option.value } });
  fireEvent.click(screen.getByRole('button', { name: action }));
}

const HAND_OVER =
  'I couldn’t find it in this chapter. Here it is, so you can look through it yourself.';

describe('AskConversation: choosing a chapter after nothing is found', () => {
  it('offers the chapters with text under the nothing-found reply', async () => {
    const { controller } = await recoverable();
    render(AskConversation, withController(controller));

    await askNothingFound(controller);

    expect(await screen.findByText('Or choose where to look:')).toBeTruthy();
    const select = screen.getByLabelText('Chapter') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Introduction',
      'Chapter 1',
      'Chapter 2',
    ]);
    controller.destroy();
  });

  it('offers no chapters under an answer that found something', async () => {
    const { controller, book } = await recoverable();
    render(AskConversation, withController(controller));

    ask(book.chunks[0].text);
    await waitFor(() => expect(controller.turns[0]?.state).toBe('done'));

    expect(screen.queryByLabelText('Chapter')).toBeNull();
    controller.destroy();
  });

  it('retries in the chosen chapter, names it, and stops offering', async () => {
    const { controller } = await recoverable();
    render(AskConversation, withController(controller));
    await askNothingFound(controller);

    chooseChapter('Chapter 2');

    expect(
      await screen.findByText(`Looking in “Chapter 2”: ${UNRELATED}`),
    ).toBeTruthy();
    await waitFor(() => expect(controller.turns[1]?.state).toBe('done'));
    expect(screen.getByText('Sources')).toBeTruthy();
    expect(screen.queryByLabelText('Chapter')).toBeNull();
    controller.destroy();
  });

  it('asks which chapter, with the list, when a typed one is unclear', async () => {
    const { controller } = await recoverable();
    render(AskConversation, withController(controller));
    await askNothingFound(controller);

    ask('try chapter 9');

    expect(
      await screen.findByText(
        'I couldn’t tell which chapter you meant. Choose it below.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByLabelText('Chapter')).toHaveLength(2);
    controller.destroy();
  });
});

const UNCITED =
  'There is no mention of a dog in any of the passages provided[None]';
const UNCITED_LINE = 'This answer cites no passage, so it can’t be checked.';

/** Asks a question that finds relevant passages and waits for its answer to finish. */
async function askAnswered(controller: OnboardingController, question: string) {
  ask(question);
  await waitFor(() => expect(controller.turns.at(-1)?.state).toBe('done'));
  expect(controller.turns.at(-1)?.verdict).toBe('relevant');
}

describe('AskConversation: an answer that cites no passage', () => {
  it('keeps the model’s text, says why, and offers the chapters', async () => {
    const { controller, book } = await recoverable({ chatChunks: [UNCITED] });
    render(AskConversation, withController(controller));

    await askAnswered(controller, book.chunks[0].text);

    expect(screen.getByText(UNCITED)).toBeTruthy();
    expect(screen.getByText(UNCITED_LINE)).toBeTruthy();
    expect(screen.getByText('Or choose where to look:')).toBeTruthy();
    const select = screen.getByLabelText('Chapter') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Introduction',
      'Chapter 1',
      'Chapter 2',
    ]);
    expect(screen.queryByText('Sources')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    controller.destroy();
  });

  it('does not add the line under a nothing-found reply', async () => {
    const { controller } = await recoverable();
    render(AskConversation, withController(controller));

    await askNothingFound(controller);

    expect(await screen.findByText('Or choose where to look:')).toBeTruthy();
    expect(screen.queryByText(UNCITED_LINE)).toBeNull();
    controller.destroy();
  });

  it('shows neither the line nor the offer under a cited answer', async () => {
    const { controller, book } = await recoverable();
    render(AskConversation, withController(controller));

    await askAnswered(controller, book.chunks[0].text);

    expect(screen.getByText('Sources')).toBeTruthy();
    expect(screen.queryByText(UNCITED_LINE)).toBeNull();
    expect(screen.queryByLabelText('Chapter')).toBeNull();
    controller.destroy();
  });

  it('removes both once a chapter is chosen', async () => {
    const { controller, book } = await recoverable({ chatChunks: [UNCITED] });
    render(AskConversation, withController(controller));
    await askAnswered(controller, book.chunks[0].text);

    chooseChapter('Chapter 2');

    expect(
      await screen.findByText(`Looking in “Chapter 2”: ${book.chunks[0].text}`),
    ).toBeTruthy();
    await waitFor(() => expect(controller.turns[1]?.state).toBe('done'));
    expect(screen.queryByText(UNCITED_LINE)).toBeNull();
    expect(screen.queryByLabelText('Chapter')).toBeNull();
    controller.destroy();
  });

  it('says it in French', async () => {
    setLanguage('fr');
    const { controller, book } = await recoverable(
      { chatChunks: [UNCITED] },
      { language: 'fr' },
    );
    render(AskConversation, withController(controller));

    fireEvent.input(screen.getByLabelText('Votre question'), {
      target: { value: book.chunks[0].text },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }));

    expect(
      await screen.findByText(
        'Cette réponse ne cite aucun passage : elle ne peut pas être vérifiée.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Ou choisissez où chercher :')).toBeTruthy();
    controller.destroy();
    setLanguage('en');
  });
});

describe('AskConversation: handing over the chapter', () => {
  it('shows the chapter text when the retry cannot answer', async () => {
    const { controller } = await recoverable({
      chatChunks: ['These passages do not say.'],
    });
    render(AskConversation, withController(controller));
    await askNothingFound(controller);

    chooseChapter('Chapter 2');

    expect(await screen.findByText(HAND_OVER)).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Chapter 2' });
    expect(region.textContent).toContain('Candide reached Lisbon');
    controller.destroy();
  });

  it('shows no chapter text when the retry answers with a citation', async () => {
    const { controller } = await recoverable();
    render(AskConversation, withController(controller));
    await askNothingFound(controller);

    chooseChapter('Chapter 2');
    await waitFor(() => expect(controller.turns[1]?.state).toBe('done'));

    expect(screen.queryByText(HAND_OVER)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Chapter 2' })).toBeNull();
    controller.destroy();
  });

  it('keeps the chapter’s paragraphs', async () => {
    const { controller } = await recoverable(
      { chatChunks: ['Nothing cited.'] },
      {},
      'First paragraph here.\n\nSecond paragraph here.',
    );
    render(AskConversation, withController(controller));
    await askNothingFound(controller);

    chooseChapter('Chapter 2');

    const region = await screen.findByRole('region', { name: 'Chapter 2' });
    expect(region.textContent).toContain(
      'First paragraph here.\n\nSecond paragraph here.',
    );
    controller.destroy();
  });

  // Collapsing itself is the browser's native <details> behaviour; the e2e spec clicks it.
  it('is shown open, in a block that collapses from its title', async () => {
    const { controller } = await recoverable({ chatChunks: ['Nothing.'] });
    render(AskConversation, withController(controller));
    await askNothingFound(controller);
    chooseChapter('Chapter 2');

    const region = await screen.findByRole('region', { name: 'Chapter 2' });
    const details = region.closest('details')!;
    expect(details.open).toBe(true);
    expect(details.firstElementChild?.tagName).toBe('SUMMARY');
    expect(details.firstElementChild?.textContent).toBe('Chapter 2');
    controller.destroy();
  });
});

describe('AskConversation: recovery by keyboard', () => {
  it('uses only native, focusable controls', async () => {
    const { controller } = await recoverable({ chatChunks: ['Nothing.'] });
    render(AskConversation, withController(controller));
    await askNothingFound(controller);

    const select = await screen.findByLabelText('Chapter');
    const button = screen.getByRole('button', {
      name: 'Look in this chapter',
    });
    expect(select.tagName).toBe('SELECT');
    expect(button.tagName).toBe('BUTTON');
    expect(button.closest('form')).toBe(select.closest('form'));

    select.focus();
    expect(document.activeElement).toBe(select);
    // Pressing Enter in a form control submits its form, as a keyboard user would.
    fireEvent.submit(select.closest('form')!);

    const region = await screen.findByRole('region', {
      name: 'Introduction',
    });
    expect(region.tabIndex).toBe(0);
    expect(region.closest('details')?.querySelector('summary')).toBeTruthy();
    controller.destroy();
  });
});

describe('AskConversation: recovery in French', () => {
  it('shows the French text throughout a recovery', async () => {
    setLanguage('fr');
    const { controller } = await recoverable(
      { chatChunks: ['Rien ici.'] },
      { language: 'fr' },
    );
    render(AskConversation, withController(controller));

    fireEvent.input(screen.getByLabelText('Votre question'), {
      target: { value: UNRELATED },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }));

    expect(await screen.findByText('Ou choisissez où chercher :')).toBeTruthy();
    chooseChapter('Chapter 2', 'Chapitre', 'Chercher dans ce chapitre');

    expect(
      await screen.findByText(`Recherche dans « Chapter 2 » : ${UNRELATED}`),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        'Je ne l’ai pas trouvé dans ce chapitre. Le voici, pour que vous puissiez le parcourir vous-même.',
      ),
    ).toBeTruthy();
    controller.destroy();
    setLanguage('en');
  });
});
