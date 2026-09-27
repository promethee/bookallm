import { fireEvent, render, screen } from '@testing-library/svelte';
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

async function ready(options: HarnessOptions = {}) {
  const book = await bookOf('Candide', 'Candide reached Lisbon.');
  const context = await harness(
    { ...READY },
    { language: 'en', books: [book], indexed: true, ...options },
  );
  await context.controller.start();
  return context;
}

const optionTexts = (select: HTMLSelectElement) =>
  [...select.options].map((option) => option.textContent);

describe('the idle unload control', () => {
  it('shows the four choices with 10 minutes selected by default', async () => {
    const { controller } = await ready();
    render(LandingScreen, withController(controller));

    const select = screen.getByLabelText(
      'Free memory after',
    ) as HTMLSelectElement;

    expect(optionTexts(select)).toEqual([
      '5 minutes',
      '10 minutes',
      '30 minutes',
      'Never',
    ]);
    expect(select.selectedOptions[0].textContent).toBe('10 minutes');
    expect(
      screen.getByText(
        'After this long without a question or claim, Ollama frees the memory it uses. The next answer then takes longer.',
      ),
    ).toBeTruthy();
    controller.destroy();
  });

  it('saves a new choice and shows it', async () => {
    const { controller, settings } = await ready();
    render(LandingScreen, withController(controller));
    const select = screen.getByLabelText(
      'Free memory after',
    ) as HTMLSelectElement;

    await fireEvent.change(select, { target: { value: 'never' } });

    expect(settings.load().idleUnload).toBe('never');
    expect(select.selectedOptions[0].textContent).toBe('Never');

    await fireEvent.change(select, { target: { value: '5' } });

    expect(settings.load().idleUnload).toBe(5);
    controller.destroy();
  });

  it('shows the saved choice', async () => {
    const { controller } = await ready();
    controller.setIdleUnload(30);
    render(LandingScreen, withController(controller));

    const select = screen.getByLabelText(
      'Free memory after',
    ) as HTMLSelectElement;

    expect(select.selectedOptions[0].textContent).toBe('30 minutes');
    controller.destroy();
  });

  it('is labelled and offered in French', async () => {
    setLanguage('fr');
    const { controller } = await ready({ language: 'fr' });
    render(LandingScreen, withController(controller));

    const select = screen.getByLabelText(
      'Libérer la mémoire après',
    ) as HTMLSelectElement;

    expect(optionTexts(select)).toEqual([
      '5 minutes',
      '10 minutes',
      '30 minutes',
      'Jamais',
    ]);
    controller.destroy();
    setLanguage('en');
  });
});
