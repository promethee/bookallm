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
import type { OllamaState } from '../lib/ollama/testing/simulated-ollama';
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
