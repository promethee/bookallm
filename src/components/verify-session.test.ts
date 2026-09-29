import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
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
import LandingScreen from './LandingScreen.svelte';

beforeEach(() => setLanguage('en'));

const withController = (controller: OnboardingController) => ({
  context: new Map([[CONTROLLER_KEY, controller]]),
});

const PASSAGE =
  'The old lighthouse keeper watched the storm from his window every single night.';

async function plainBook(text = PASSAGE) {
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

/** `random` at 0.9 shows the changed claim; below 0.5 the true one. */
async function ready(
  state: OllamaState = { ...READY },
  options: HarnessOptions = {},
) {
  const book = await plainBook();
  const context = await harness(state, {
    language: 'en',
    books: [book],
    indexed: true,
    random: () => 0.9,
    ...options,
  });
  await context.controller.start();
  return { ...context, book };
}

const tab = (name: string) => screen.getByRole('tab', { name });

describe('mode tabs', () => {
  it('shows Ask and Verify tabs for a ready book, with Ask selected', async () => {
    const { controller } = await ready();
    render(LandingScreen, withController(controller));

    expect(tab('Ask').getAttribute('aria-selected')).toBe('true');
    expect(tab('Verify').getAttribute('aria-selected')).toBe('false');
    expect(
      screen.getByText('Ask mode: answers are cited, check them'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Your question')).toBeTruthy();
    controller.destroy();
  });

  it('shows no tabs without a book', async () => {
    const context = await harness({ ...READY }, { language: 'en' });
    await context.controller.start();
    render(LandingScreen, withController(context.controller));

    expect(screen.queryByRole('tablist')).toBeNull();
    context.controller.destroy();
  });

  it('switches the line and the panel when Verify is chosen', async () => {
    const { controller } = await ready();
    render(LandingScreen, withController(controller));

    await fireEvent.click(tab('Verify'));

    expect(tab('Verify').getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getByText('Verify mode: the claim below may be false'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Your question')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Give me a claim' }),
    ).toBeTruthy();
    controller.destroy();
  });

  it('moves between tabs with the arrow keys, keeping only the selected one tabbable', async () => {
    const { controller } = await ready();
    render(LandingScreen, withController(controller));
    expect(tab('Ask').tabIndex).toBe(0);
    expect(tab('Verify').tabIndex).toBe(-1);

    await fireEvent.keyDown(tab('Ask'), { key: 'ArrowRight' });

    expect(controller.mode).toBe('verify');
    expect(document.activeElement).toBe(tab('Verify'));
    expect(tab('Verify').tabIndex).toBe(0);

    await fireEvent.keyDown(tab('Verify'), { key: 'ArrowLeft' });
    expect(controller.mode).toBe('ask');
    controller.destroy();
  });
});

describe('Verify session', () => {
  it('asks for a claim, judges it, and reveals the passage and tally', async () => {
    const { controller } = await ready();
    controller.setMode('verify');
    render(LandingScreen, withController(controller));
    expect(screen.getByText('This session: 0 right out of 0')).toBeTruthy();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Give me a claim' }),
    );

    expect(await screen.findByText('Is this what the book says?')).toBeTruthy();
    expect(screen.getByText(/^Changed:/)).toBeTruthy();
    expect(screen.queryByText('From the book')).toBeNull();
    expect(screen.queryByText('What the book says:')).toBeNull();
    expect(screen.queryByText('The words that were changed:')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'False' }));

    expect(screen.getByText('You were right.')).toBeTruthy();
    expect(
      screen.getByText(
        'This claim was false. What was changed: who did or said it.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('What the book says:')).toBeTruthy();
    expect(screen.getByText(`Claim: ${PASSAGE}`)).toBeTruthy();
    expect(screen.getByText('The words that were changed:')).toBeTruthy();
    expect(screen.getByText('“Claim” became “Changed”')).toBeTruthy();
    expect(screen.getByText('Claim', { selector: 'del' })).toBeTruthy();
    expect(screen.getByText('Changed', { selector: 'ins' })).toBeTruthy();
    expect(screen.getByText('From the book')).toBeTruthy();
    expect(screen.getByText(PASSAGE)).toBeTruthy();
    expect(screen.getByText('This session: 1 right out of 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'True' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next claim' })).toBeTruthy();
    controller.destroy();
  });

  it('says a true claim was true when judged wrong', async () => {
    const { controller } = await ready({ ...READY }, { random: () => 0.1 });
    controller.setMode('verify');
    render(LandingScreen, withController(controller));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Give me a claim' }),
    );
    await fireEvent.click(await screen.findByRole('button', { name: 'False' }));

    expect(screen.getByText('Not this time.')).toBeTruthy();
    expect(screen.getByText('This claim was true.')).toBeTruthy();
    expect(screen.queryByText('What the book says:')).toBeNull();
    expect(screen.queryByText('The words that were changed:')).toBeNull();
    expect(screen.getByText('This session: 0 right out of 1')).toBeTruthy();
    controller.destroy();
  });

  it('says getting ready while waiting, and stops', async () => {
    const { controller } = await ready({ ...READY, chatStall: true });
    controller.setMode('verify');
    render(LandingScreen, withController(controller));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Give me a claim' }),
    );

    expect(
      await screen.findByText(
        'Getting the AI ready. The first claim can take a few minutes.',
      ),
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(
      await screen.findByRole('button', { name: 'Give me a claim' }),
    ).toBeTruthy();
    controller.destroy();
  });

  it('shows a plain failure with a retry that works', async () => {
    const state: OllamaState = { ...READY, chatDropAfter: 0 };
    const { controller } = await ready(state);
    controller.setMode('verify');
    render(LandingScreen, withController(controller));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Give me a claim' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Ollama seems to have stopped',
    );
    state.chatDropAfter = undefined;
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'True' })).toBeTruthy();
    controller.destroy();
  });

  it('says a fair claim could not be made when the change was never confirmed', async () => {
    const { controller } = await ready({ ...READY, claimVerdict: 'MATCHES' });
    controller.setMode('verify');
    render(LandingScreen, withController(controller));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Give me a claim' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'This passage didn’t give a reliable claim this time.',
    );
    controller.destroy();
  });
});

describe('switching modes keeps both', () => {
  it('keeps the Ask conversation, the claim and the tally across a round trip', async () => {
    const { controller, book } = await ready();
    render(LandingScreen, withController(controller));

    fireEvent.input(screen.getByLabelText('Your question'), {
      target: { value: book.chunks[0].text },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(controller.turns[0]?.state).toBe('done'));
    const answer = `Answer: ${book.chunks[0].text} [1]`;

    await fireEvent.click(tab('Verify'));
    await fireEvent.click(
      screen.getByRole('button', { name: 'Give me a claim' }),
    );
    await fireEvent.click(await screen.findByRole('button', { name: 'False' }));
    expect(screen.getByText('This session: 1 right out of 1')).toBeTruthy();

    await fireEvent.click(tab('Ask'));
    expect(screen.getByText(answer)).toBeTruthy();

    await fireEvent.click(tab('Verify'));
    expect(screen.getByText('You were right.')).toBeTruthy();
    expect(screen.getByText('This session: 1 right out of 1')).toBeTruthy();
    controller.destroy();
  });
});

describe('Verify reveal of changed words', () => {
  it('shows added and removed words, one line per change', async () => {
    const { controller, book } = await ready();
    controller.setMode('verify');
    const chunk = book.chunks[0];
    controller.verify = {
      state: 'revealed',
      guess: false,
      claim: {
        claim: 'The keeper watched the storm from Lisbon.',
        isTrue: false,
        trueClaim: 'The old keeper watched the storm.',
        changedAttribute: 'where',
        changes: [
          { before: 'old', after: '' },
          { before: '', after: 'from Lisbon' },
        ],
        citation: {
          chunkId: chunk.id,
          locator: chunk.locator,
          text: chunk.text,
        },
        difficulty: 'flat',
      },
    };
    render(LandingScreen, withController(controller));

    expect(screen.getByText('“old” was removed')).toBeTruthy();
    expect(screen.getByText('“from Lisbon” was added')).toBeTruthy();
    expect(screen.getByText('old', { selector: 'del' })).toBeTruthy();
    expect(screen.getByText('from Lisbon', { selector: 'ins' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    controller.destroy();
  });
});

describe('Verify session in French', () => {
  it('shows the French text throughout a full claim', async () => {
    setLanguage('fr');
    const { controller } = await ready({ ...READY }, { language: 'fr' });
    render(LandingScreen, withController(controller));

    await fireEvent.click(tab('Vérification'));
    expect(
      screen.getByText(
        'Mode Vérification : l’affirmation ci-dessous est peut-être fausse',
      ),
    ).toBeTruthy();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Recevoir une affirmation' }),
    );
    await fireEvent.click(await screen.findByRole('button', { name: 'Faux' }));

    expect(screen.getByText('Bonne réponse.')).toBeTruthy();
    expect(
      screen.getByText(
        'Cette affirmation était fausse. Ce qui a été changé : qui a agi ou parlé.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Ce que dit le livre :')).toBeTruthy();
    expect(screen.getByText('Mots modifiés :')).toBeTruthy();
    expect(screen.getByText('« Claim » est devenu « Changed »')).toBeTruthy();
    expect(screen.getByText('Extrait du livre')).toBeTruthy();
    expect(
      screen.getByText('Cette session : 1 bonne réponse sur 1'),
    ).toBeTruthy();
    controller.destroy();
  });
});
