import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../lib/i18n';
import { CONTROLLER_KEY } from '../lib/onboarding/context';
import type { OnboardingController } from '../lib/onboarding/controller.svelte';
import { harness, READY } from '../lib/onboarding/testing/harness';
import type { OllamaState } from '../lib/ollama/testing/simulated-ollama';
import HardwareWarningScreen from './HardwareWarningScreen.svelte';

const withController = (controller: OnboardingController) => ({
  context: new Map([[CONTROLLER_KEY, controller]]),
});

const notAccelerated: OllamaState = {
  ...READY,
  runningModels: [{ model: 'bge-m3:latest', size: 1_000_000, size_vram: 0 }],
};

describe('HardwareWarningScreen', () => {
  it('explains the likely wait and offers to continue', async () => {
    const { controller } = await harness(notAccelerated, {
      language: 'en',
      hardwareCheckResolved: false,
    });
    await controller.start();

    render(HardwareWarningScreen, withController(controller));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'This computer may be slow at this',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/likely take several minutes each/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Continue anyway' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.tabIndex).not.toBe(-1);
    controller.destroy();
  });

  it('moves on and remembers the choice when continuing', async () => {
    const { controller, settings } = await harness(notAccelerated, {
      language: 'en',
      hardwareCheckResolved: false,
    });
    await controller.start();
    render(HardwareWarningScreen, withController(controller));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Continue anyway' }),
    );

    expect(controller.screen).not.toBe('hardware-warning');
    expect(settings.load().hardwareCheckResolved).toBe(true);
    controller.destroy();
  });

  it('shows the French flow', async () => {
    setLanguage('fr');
    const { controller } = await harness(notAccelerated, {
      language: 'fr',
      hardwareCheckResolved: false,
    });
    await controller.start();

    render(HardwareWarningScreen, withController(controller));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Cet ordinateur risque d’être lent',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Continuer quand même' }),
    ).toBeTruthy();
    controller.destroy();
  });
});
