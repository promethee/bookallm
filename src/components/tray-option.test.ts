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

const LABEL = 'Keep running in the tray when closed';

describe('the tray option', () => {
  it('is on by default', async () => {
    const { controller } = await ready();
    render(LandingScreen, withController(controller));

    const box = screen.getByLabelText(LABEL) as HTMLInputElement;

    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(true);
    controller.destroy();
  });

  it('saves the change and tells the tray', async () => {
    const { controller, settings, trayConfigs } = await ready();
    render(LandingScreen, withController(controller));
    const box = screen.getByLabelText(LABEL) as HTMLInputElement;

    await fireEvent.click(box);

    expect(box.checked).toBe(false);
    expect(settings.load().closeToTray).toBe(false);
    expect(trayConfigs.at(-1)?.closeToTray).toBe(false);
    controller.destroy();
  });

  it('is labelled in French', async () => {
    setLanguage('fr');
    const { controller } = await ready({ language: 'fr' });
    render(LandingScreen, withController(controller));

    expect(
      screen.getByLabelText(
        'Rester dans la zone de notification à la fermeture',
      ),
    ).toBeTruthy();
    controller.destroy();
    setLanguage('en');
  });
});
