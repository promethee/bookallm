import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import { getLanguage } from '../lib/i18n';
import { CONTROLLER_KEY } from '../lib/onboarding/context';
import type { OnboardingController } from '../lib/onboarding/controller.svelte';
import { bookOf, harness, READY } from '../lib/onboarding/testing/harness';
import CheckingScreen from './CheckingScreen.svelte';
import LandingScreen from './LandingScreen.svelte';
import LanguageScreen from './LanguageScreen.svelte';
import LiveRegion from './LiveRegion.svelte';

const withController = (controller: OnboardingController) => ({
  context: new Map([[CONTROLLER_KEY, controller]]),
});

describe('LanguageScreen', () => {
  it('offers both languages with the suggested one selected', async () => {
    const { controller } = await harness(READY, { systemLanguages: ['fr-CA'] });
    await controller.start();

    render(LanguageScreen, withController(controller));

    expect(
      (screen.getByRole('radio', { name: 'Français' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: 'English' }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    controller.destroy();
  });

  it('preselects English for any other system language', async () => {
    const { controller } = await harness(READY, { systemLanguages: ['de'] });
    await controller.start();

    render(LanguageScreen, withController(controller));

    expect(
      (screen.getByRole('radio', { name: 'English' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    controller.destroy();
  });

  it('shows the new language at once when a choice is made, without saving it yet', async () => {
    const { controller, settings } = await harness(READY);
    await controller.start();
    render(LanguageScreen, withController(controller));

    await fireEvent.click(screen.getByRole('radio', { name: 'Français' }));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Choisissez votre langue',
      }),
    ).toBeTruthy();
    expect(settings.load().language).toBeUndefined();
    controller.destroy();
  });

  it('saves the choice and moves on when the reader continues', async () => {
    const { controller, settings } = await harness(READY);
    await controller.start();
    render(LanguageScreen, withController(controller));
    await fireEvent.click(screen.getByRole('radio', { name: 'Français' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(settings.load().language).toBe('fr');
    expect(controller.screen).not.toBe('language');
    controller.destroy();
  });

  it('can be switched back and forth without losing the choice', async () => {
    const { controller } = await harness(READY);
    await controller.start();
    render(LanguageScreen, withController(controller));

    await fireEvent.click(screen.getByRole('radio', { name: 'Français' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'English' }));

    expect(getLanguage()).toBe('en');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Choose your language' }),
    ).toBeTruthy();
    controller.destroy();
  });
});

describe('CheckingScreen', () => {
  it('says it is checking, and is marked busy', async () => {
    const { controller } = await harness(READY);

    render(CheckingScreen, withController(controller));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Checking your setup…' }),
    ).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

describe('LandingScreen', () => {
  it('shows the mode line, the active book and what comes next', async () => {
    const { controller } = await harness(READY, {
      language: 'en',
      books: [await bookOf('Candide')],
    });
    await controller.start();

    render(LandingScreen, withController(controller));

    expect(
      screen.getByRole('heading', { level: 1, name: 'BookaLLM' }),
    ).toBeTruthy();
    expect(
      screen.getByText('Ask mode — answers are cited, check them'),
    ).toBeTruthy();
    expect(screen.getByText('Candide')).toBeTruthy();
    expect(screen.getByText('by Someone')).toBeTruthy();
    expect(screen.getByText('1 chapter')).toBeTruthy();
    expect(screen.getByText(/arrives in a later step/)).toBeTruthy();
    controller.destroy();
  });

  it('says no book is selected and offers to import one when there is none', async () => {
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();
    controller.postponeImport();

    render(LandingScreen, withController(controller));

    expect(screen.getByText(/No book is selected yet/)).toBeTruthy();
    expect(screen.queryByText('Active book')).toBeNull();
    expect(screen.getByRole('button', { name: 'Import a book' })).toBeTruthy();
    controller.destroy();
  });

  it('asks for the import screen from its button', async () => {
    const { controller } = await harness(READY, {
      language: 'en',
      books: [await bookOf('Candide')],
    });
    await controller.start();
    render(LandingScreen, withController(controller));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Import a book' }),
    );

    expect(controller.screen).toBe('import-book');
    controller.destroy();
  });

  it('is entirely in French when the language is French', async () => {
    const { controller } = await harness(READY, {
      language: 'fr',
      books: [await bookOf('Candide')],
    });
    await controller.start();

    render(LandingScreen, withController(controller));

    expect(
      screen.getByText(
        'Mode Question — les réponses sont citées, vérifiez-les',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Livre actif')).toBeTruthy();
    expect(screen.getByText('de Someone')).toBeTruthy();
    expect(screen.getByText('1 chapitre')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Importer un livre' }),
    ).toBeTruthy();
    controller.destroy();
  });

  it('keeps the active book when the language changes', async () => {
    const { controller } = await harness(READY, {
      language: 'en',
      books: [await bookOf('Candide')],
    });
    await controller.start();
    render(LandingScreen, withController(controller));

    controller.changeLanguage('fr');
    await tick();

    expect(screen.getByText('Candide')).toBeTruthy();
    expect(controller.activeBook?.title).toBe('Candide');
    controller.destroy();
  });
});

describe('LiveRegion', () => {
  it('announces a message politely, in the current language', async () => {
    const { controller } = await harness(READY, { language: 'en' });
    render(LiveRegion, withController(controller));
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');

    controller.announcement = {
      key: 'announce.importDone',
      params: { title: 'Candide' },
    };
    await tick();

    expect(region.textContent).toBe('Imported: Candide');

    controller.changeLanguage('fr');
    await tick();
    expect(region.textContent).toBe('Importé : Candide');
  });
});
