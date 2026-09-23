// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import type { OllamaState } from '../ollama/testing/simulated-ollama';
import { harness, READY } from './testing/harness';

beforeEach(() => setLanguage('en'));

const requestCount = (fake: { requests: { path: string }[] }, path: string) =>
  fake.requests.filter((r) => r.path === path).length;

const notAccelerated = [
  { model: 'bge-m3:latest', size: 1_000_000, size_vram: 0 },
];

describe('the hardware warning', () => {
  it('is shown on a machine with no GPU acceleration', async () => {
    const state: OllamaState = { ...READY, runningModels: notAccelerated };
    const { controller } = await harness(state, {
      language: 'en',
      hardwareCheckResolved: false,
    });

    await controller.start();

    expect(controller.screen).toBe('hardware-warning');
    controller.destroy();
  });

  it('is skipped, and remembered, on an accelerated machine', async () => {
    const { controller, settings } = await harness(READY, {
      language: 'en',
      hardwareCheckResolved: false,
    });

    await controller.start();

    expect(controller.screen).not.toBe('hardware-warning');
    expect(controller.hardwareCheck).toBe('accelerated');
    expect(settings.load().hardwareCheckResolved).toBe(true);
    controller.destroy();
  });

  it('is skipped, but not remembered, when the check is inconclusive', async () => {
    const state: OllamaState = { ...READY, psFail: true };
    const { controller, settings } = await harness(state, {
      language: 'en',
      hardwareCheckResolved: false,
    });

    await controller.start();

    expect(controller.screen).not.toBe('hardware-warning');
    expect(controller.hardwareCheck).toBe('inconclusive');
    expect(settings.load().hardwareCheckResolved).toBeUndefined();
    controller.destroy();
  });

  it('does not check again once already resolved', async () => {
    const { controller, fake } = await harness(READY, { language: 'en' });

    await controller.start();

    expect(controller.hardwareCheck).toBe('skip');
    expect(controller.screen).not.toBe('hardware-warning');
    expect(requestCount(fake, '/api/embed')).toBe(0);
    expect(requestCount(fake, '/api/ps')).toBe(0);
    controller.destroy();
  });

  it('"continue anyway" moves on at once and is remembered', async () => {
    const state: OllamaState = { ...READY, runningModels: notAccelerated };
    const { controller, settings } = await harness(state, {
      language: 'en',
      hardwareCheckResolved: false,
    });
    await controller.start();
    expect(controller.screen).toBe('hardware-warning');

    controller.acknowledgeHardwareWarning();

    expect(controller.screen).not.toBe('hardware-warning');
    expect(settings.load().hardwareCheckResolved).toBe(true);
    controller.destroy();
  });
});
