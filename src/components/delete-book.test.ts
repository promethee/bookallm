import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../lib/i18n';
import { CONTROLLER_KEY } from '../lib/onboarding/context';
import type { OnboardingController } from '../lib/onboarding/controller.svelte';
import {
  bookOf,
  harness,
  READY,
  type HarnessOptions,
} from '../lib/onboarding/testing/harness';
import LandingScreen from './LandingScreen.svelte';

beforeEach(() => setLanguage('en'));

const withController = (controller: OnboardingController) => ({
  context: new Map([[CONTROLLER_KEY, controller]]),
});

const DISCLOSURE =
  'This removes BookaLLM’s copy of the book and its index. Your EPUB file stays where it is.';

/** An older book and a newer, active one, both ready. */
async function twoBooks(options: HarnessOptions = {}) {
  const older = await bookOf('Older Book', 'The lighthouse keeper watched.');
  const newer = await bookOf('Newer Book', 'Candide reached Lisbon.');
  const context = await harness(
    { ...READY },
    {
      language: 'en',
      books: [older, newer],
      indexed: true,
      ...options,
    },
  );
  await context.controller.start();
  return { ...context, older, newer };
}

const button = (name: string) => screen.getByRole('button', { name });

describe('deleting the active book: the confirmation', () => {
  it('asks first, saying what is removed and what is not', async () => {
    const { controller, library, newer } = await twoBooks();
    render(LandingScreen, withController(controller));

    await fireEvent.click(button('Delete this book'));

    expect(screen.getByText(DISCLOSURE)).toBeTruthy();
    expect(button('Delete')).toBeTruthy();
    expect(button('Cancel')).toBeTruthy();
    expect(await library.getBook(newer.hash)).toBeDefined();
    controller.destroy();
  });

  it('changes nothing when cancelled', async () => {
    const { controller, library, newer } = await twoBooks();
    render(LandingScreen, withController(controller));
    await fireEvent.click(button('Delete this book'));

    await fireEvent.click(button('Cancel'));

    await waitFor(() => expect(screen.queryByText(DISCLOSURE)).toBeNull());
    expect(button('Delete this book')).toBeTruthy();
    expect(controller.activeBook?.hash).toBe(newer.hash);
    expect(await library.getBook(newer.hash)).toBeDefined();
    controller.destroy();
  });

  it('deletes on Delete and names the book shown next', async () => {
    const { controller, library, newer } = await twoBooks();
    render(LandingScreen, withController(controller));
    await fireEvent.click(button('Delete this book'));

    await fireEvent.click(button('Delete'));

    expect(await screen.findByText('Now showing: Older Book')).toBeTruthy();
    expect(screen.getByText('Older Book')).toBeTruthy();
    expect(await library.getBook(newer.hash)).toBeUndefined();
    // The next book starts with a closed confirmation of its own.
    expect(screen.queryByText(DISCLOSURE)).toBeNull();
    expect(button('Delete this book')).toBeTruthy();
    controller.destroy();
  });

  it('says plainly when deleting fails, and Delete tries again', async () => {
    const { controller, library } = await twoBooks();
    const remove = library.registry.remove.bind(library.registry);
    library.registry.remove = () => Promise.reject(new Error('refused'));
    render(LandingScreen, withController(controller));
    await fireEvent.click(button('Delete this book'));

    await fireEvent.click(button('Delete'));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'BookaLLM could not delete this book. Nothing was removed.',
    );
    expect(screen.getByText('Newer Book')).toBeTruthy();

    library.registry.remove = remove;
    await fireEvent.click(button('Delete'));

    expect(await screen.findByText('Now showing: Older Book')).toBeTruthy();
    controller.destroy();
  });
});

describe('deleting the active book: focus', () => {
  it('focuses Cancel when the confirmation opens', async () => {
    const { controller } = await twoBooks();
    render(LandingScreen, withController(controller));

    await fireEvent.click(button('Delete this book'));

    await waitFor(() => expect(document.activeElement).toBe(button('Cancel')));
    controller.destroy();
  });

  it('returns focus to the delete action when cancelled', async () => {
    const { controller } = await twoBooks();
    render(LandingScreen, withController(controller));
    await fireEvent.click(button('Delete this book'));

    await fireEvent.click(button('Cancel'));

    await waitFor(() =>
      expect(document.activeElement).toBe(button('Delete this book')),
    );
    controller.destroy();
  });

  it('moves focus to the line naming the next book after a deletion', async () => {
    const { controller } = await twoBooks();
    render(LandingScreen, withController(controller));
    await fireEvent.click(button('Delete this book'));

    await fireEvent.click(button('Delete'));

    const notice = await screen.findByText('Now showing: Older Book');
    await waitFor(() => expect(document.activeElement).toBe(notice));
    controller.destroy();
  });
});

describe('deleting the active book: in French', () => {
  it('shows the French text throughout', async () => {
    setLanguage('fr');
    const { controller } = await twoBooks({ language: 'fr' });
    render(LandingScreen, withController(controller));

    await fireEvent.click(button('Supprimer ce livre'));
    expect(
      screen.getByText(
        'Cela supprime la copie du livre et son index dans BookaLLM. Votre fichier EPUB reste où il est.',
      ),
    ).toBeTruthy();
    expect(button('Annuler')).toBeTruthy();
    await fireEvent.click(button('Supprimer'));

    expect(await screen.findByText('Livre affiché : Older Book')).toBeTruthy();
    controller.destroy();
    setLanguage('en');
  });
});
