// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { harness, READY } from './testing/harness';

beforeEach(() => setLanguage('en'));

describe('the tray configuration', () => {
  it('is sent at start: on by default, with English menu text', async () => {
    const { controller, trayConfigs } = await harness(READY, {
      language: 'en',
    });

    await controller.start();

    expect(trayConfigs.at(-1)).toEqual({
      closeToTray: true,
      showLabel: 'Show BookaLLM',
      quitLabel: 'Quit BookaLLM',
    });
    controller.destroy();
  });

  it('is sent again, and saved, when the setting changes', async () => {
    const { controller, trayConfigs, settings } = await harness(READY, {
      language: 'en',
    });
    await controller.start();

    controller.setCloseToTray(false);

    expect(settings.load().closeToTray).toBe(false);
    expect(trayConfigs.at(-1)?.closeToTray).toBe(false);
    controller.destroy();
  });

  it('keeps the saved setting after a restart', async () => {
    const first = await harness(READY, { language: 'en' });
    await first.controller.start();
    first.controller.setCloseToTray(false);
    first.controller.destroy();

    const again = await harness(READY, { language: 'en' });
    again.settings.save({ closeToTray: false });
    await again.controller.start();

    expect(again.trayConfigs.at(-1)?.closeToTray).toBe(false);
    again.controller.destroy();
  });

  it('follows the interface language', async () => {
    const { controller, trayConfigs } = await harness(READY, {
      language: 'en',
    });
    await controller.start();

    controller.changeLanguage('fr');

    expect(trayConfigs.at(-1)).toMatchObject({
      showLabel: 'Afficher BookaLLM',
      quitLabel: 'Quitter BookaLLM',
    });
    controller.destroy();
    setLanguage('en');
  });
});
