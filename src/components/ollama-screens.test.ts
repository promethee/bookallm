import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { CONTROLLER_KEY } from '../lib/onboarding/context';
import type { OnboardingController } from '../lib/onboarding/controller.svelte';
import { harness } from '../lib/onboarding/testing/harness';
import type { OllamaState } from '../lib/ollama/testing/simulated-ollama';
import GetOllamaScreen from './GetOllamaScreen.svelte';
import ModelsScreen from './ModelsScreen.svelte';
import UpdateOllamaScreen from './UpdateOllamaScreen.svelte';

const withController = (controller: OnboardingController) => ({
  context: new Map([[CONTROLLER_KEY, controller]]),
});

/** Intl uses no-break spaces; compare with plain ones. */
const plain = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

const STOPPED: OllamaState = { installed: [] };
const MISSING_CHAT = (): OllamaState => ({
  version: '0.34.0',
  installed: ['bge-m3:latest'],
});
const MISSING_BOTH = (): OllamaState => ({ version: '0.34.0', installed: [] });

describe('GetOllamaScreen', () => {
  it('explains what Ollama is and lists the steps in order', async () => {
    const { controller } = await harness(STOPPED, { language: 'en' });
    await controller.start();

    render(GetOllamaScreen, withController(controller));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Let’s get Ollama running',
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /runs on your own computer, so your books never leave it/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/may already be installed but not running/),
    ).toBeTruthy();
    const steps = screen
      .getAllByRole('listitem')
      .map((item) => plain(item.textContent));
    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain('Download Ollama');
    expect(steps[1]).toContain('installer');
    expect(steps[2]).toContain('Make sure Ollama is running');
    expect(steps[3]).toContain('Check again');
    controller.destroy();
  });

  it.each([
    ['windows', 'https://ollama.com/download/windows'],
    ['macos', 'https://ollama.com/download/mac'],
    ['linux', 'https://ollama.com/download/linux'],
    ['unknown', 'https://ollama.com/download'],
  ] as const)(
    'opens the official page for %s when the button is pressed',
    async (platform, url) => {
      const { controller, opened } = await harness(STOPPED, {
        language: 'en',
        platform,
      });
      await controller.start();
      render(GetOllamaScreen, withController(controller));
      expect(screen.getByText(`Download page: ${url}`)).toBeTruthy();

      await fireEvent.click(
        screen.getByRole('button', { name: 'Go to the Ollama download page' }),
      );

      await waitFor(() => expect(opened).toEqual([url]));
      expect(screen.queryByRole('alert')).toBeNull();
      controller.destroy();
    },
  );

  it('shows the address to copy when the browser could not be opened', async () => {
    const { controller, services } = await harness(STOPPED, { language: 'en' });
    services.openExternal = async () => false;
    await controller.start();
    render(GetOllamaScreen, withController(controller));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Go to the Ollama download page' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'could not be opened',
    );
    expect(
      screen.getByText('Download page: https://ollama.com/download/windows'),
    ).toBeTruthy();
    controller.destroy();
  });

  it('checks again on request and moves on once Ollama answers', async () => {
    const state: OllamaState = { installed: ['llama3.1:8b', 'bge-m3:latest'] };
    const { controller } = await harness(state, { language: 'en' });
    await controller.start();
    render(GetOllamaScreen, withController(controller));
    expect(controller.screen).toBe('get-ollama');

    state.version = '0.34.0';
    await fireEvent.click(screen.getByRole('button', { name: 'Check again' }));

    await waitFor(() => expect(controller.screen).toBe('import-book'));
    controller.destroy();
  });

  it('keeps the advanced section closed by default, and refuses an address that is not a web address', async () => {
    const { controller, settings } = await harness(STOPPED, { language: 'en' });
    await controller.start();
    render(GetOllamaScreen, withController(controller));
    const details = document.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);

    const input = screen.getByLabelText('Ollama address');
    await fireEvent.input(input, { target: { value: 'not a web address' } });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Use this address' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'does not look like a web address',
    );
    expect(settings.load().ollamaUrl).toBe('http://127.0.0.1:11434');
    controller.destroy();
  });

  it('uses and remembers a valid address', async () => {
    const { controller, settings, fake } = await harness(STOPPED, {
      language: 'en',
    });
    await controller.start();
    render(GetOllamaScreen, withController(controller));

    await fireEvent.input(screen.getByLabelText('Ollama address'), {
      target: { value: 'http://ollama.lan:9999' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Use this address' }),
    );

    await waitFor(() =>
      expect(settings.load().ollamaUrl).toBe('http://ollama.lan:9999'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() =>
      expect(fake.requests.at(-1)?.url).toMatch(/^http:\/\/ollama\.lan:9999\//),
    );
    controller.destroy();
  });

  it('is in French when the language is French', async () => {
    const { controller } = await harness(STOPPED, { language: 'fr' });
    await controller.start();

    render(GetOllamaScreen, withController(controller));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Mettons Ollama en marche',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Aller à la page de téléchargement d’Ollama',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Vérifier à nouveau' }),
    ).toBeTruthy();
    expect(screen.getByText('Avancé')).toBeTruthy();
    controller.destroy();
  });
});

describe('UpdateOllamaScreen', () => {
  it('states the installed and the required version in plain words', async () => {
    const { controller } = await harness(
      { version: '0.3.0', installed: [] },
      { language: 'en' },
    );
    await controller.start();

    render(UpdateOllamaScreen, withController(controller));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ollama needs an update' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'You have Ollama 0.3.0, but BookaLLM needs version 0.3.4 or newer.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Go to the Ollama download page' }),
    ).toBeTruthy();
    controller.destroy();
  });

  it('opens the download page and checks again', async () => {
    const state: OllamaState = {
      version: '0.3.0',
      installed: ['llama3.1:8b', 'bge-m3:latest'],
    };
    const { controller, opened } = await harness(state, { language: 'en' });
    await controller.start();
    render(UpdateOllamaScreen, withController(controller));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Go to the Ollama download page' }),
    );
    await waitFor(() =>
      expect(opened).toEqual(['https://ollama.com/download/windows']),
    );

    state.version = '0.34.0';
    await fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(controller.screen).toBe('import-book'));
    controller.destroy();
  });

  it('is in French', async () => {
    const { controller } = await harness(
      { version: '0.3.0', installed: [] },
      { language: 'fr' },
    );
    await controller.start();

    render(UpdateOllamaScreen, withController(controller));

    expect(
      screen.getByText(
        'Vous avez Ollama 0.3.0, mais BookaLLM a besoin de la version 0.3.4 ou plus récente.',
      ),
    ).toBeTruthy();
    controller.destroy();
  });
});

describe('ModelsScreen: confirming what will be downloaded', () => {
  it('lists only the missing model with its size, says it is a one-time step, and downloads nothing yet', async () => {
    const { controller, fake } = await harness(MISSING_CHAT(), {
      language: 'en',
    });
    await controller.start();

    render(ModelsScreen, withController(controller));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Download the AI models' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/one-time step and may take a few minutes/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Nothing is downloaded until you press the button/),
    ).toBeTruthy();
    expect(plain(screen.getByRole('list').textContent)).toContain(
      'llama3.1:8b: about 4.9 GB',
    );
    expect(plain(screen.getByRole('list').textContent)).not.toContain('bge-m3');
    expect(screen.getByText('Total: about 4.9 GB')).toBeTruthy();
    expect(fake.requests.some((request) => request.method === 'POST')).toBe(
      false,
    );
    controller.destroy();
  });

  it('totals both models when both are missing', async () => {
    const { controller } = await harness(MISSING_BOTH(), { language: 'en' });
    await controller.start();

    render(ModelsScreen, withController(controller));

    expect(plain(screen.getByRole('list').textContent)).toContain(
      'bge-m3: about 1.2 GB',
    );
    expect(screen.getByText('Total: about 6.1 GB')).toBeTruthy();
    controller.destroy();
  });

  it('shows sizes in French conventions', async () => {
    const { controller } = await harness(MISSING_CHAT(), { language: 'fr' });
    await controller.start();

    render(ModelsScreen, withController(controller));

    expect(plain(screen.getByRole('list').textContent)).toContain(
      'llama3.1:8b : environ 4,9 Go',
    );
    expect(plain(document.body.textContent)).toContain(
      'Total : environ 4,9 Go',
    );
    controller.destroy();
  });

  it('prefills the model names and recalculates the list when one is changed', async () => {
    const { controller } = await harness(MISSING_CHAT(), { language: 'en' });
    await controller.start();
    render(ModelsScreen, withController(controller));
    const chat = screen.getByLabelText('Answering model') as HTMLInputElement;
    expect(chat.value).toBe('llama3.1:8b');
    expect(
      (screen.getByLabelText('Search model') as HTMLInputElement).value,
    ).toBe('bge-m3');

    await fireEvent.change(chat, { target: { value: 'phi3:mini' } });

    await waitFor(() =>
      expect(plain(screen.getByRole('list').textContent)).toContain(
        'phi3:mini: size unknown',
      ),
    );
    expect(screen.queryByText(/^Total/)).toBeNull();
    controller.destroy();
  });

  it('leaves a model of unknown size out of the total and says the total is partial', async () => {
    const { controller } = await harness(MISSING_BOTH(), { language: 'en' });
    await controller.start();
    render(ModelsScreen, withController(controller));

    await fireEvent.change(screen.getByLabelText('Answering model'), {
      target: { value: 'phi3:mini' },
    });

    await waitFor(() =>
      expect(
        screen.getByText('Total of the known sizes: about 1.2 GB'),
      ).toBeTruthy(),
    );
    controller.destroy();
  });

  it('moves on when the edited names are already installed', async () => {
    const { controller } = await harness(
      { version: '0.34.0', installed: ['bge-m3:latest', 'qwen2.5:3b'] },
      { language: 'en' },
    );
    await controller.start();
    render(ModelsScreen, withController(controller));

    await fireEvent.change(screen.getByLabelText('Answering model'), {
      target: { value: 'qwen2.5:3b' },
    });

    await waitFor(() => expect(controller.screen).toBe('import-book'));
    controller.destroy();
  });
});

describe('ModelsScreen: downloading', () => {
  it('shows the model, the phase, the amount and an accessible progress bar', async () => {
    const state = { ...MISSING_CHAT(), stallPulls: true };
    const { controller } = await harness(state, { language: 'en' });
    await controller.start();
    render(ModelsScreen, withController(controller));

    await fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByText('Downloading llama3.1:8b…')).toBeTruthy();
    expect(screen.getByText('Downloading…')).toBeTruthy();
    const bar = screen.getByRole('progressbar', {
      name: 'Download progress',
    }) as HTMLProgressElement;
    expect(bar.value).toBe(30_000_000);
    expect(bar.max).toBe(100_000_000);
    expect(plain(document.body.textContent)).toContain('30 MB of 100 MB (30%)');
    controller.cancelDownload();
    controller.destroy();
  });

  it('cancels, keeps the progress, and continues from where it stopped', async () => {
    const state = { ...MISSING_CHAT(), stallPulls: true };
    const { controller } = await harness(state, { language: 'en' });
    await controller.start();
    render(ModelsScreen, withController(controller));
    await fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await screen.findByText('Downloading llama3.1:8b…');

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText(/The download was cancelled/)).toBeTruthy();
    expect(plain(document.body.textContent)).toContain('30 MB of 100 MB');

    state.stallPulls = false;
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(controller.screen).toBe('import-book'));
    controller.destroy();
  });

  it('moves on by itself when the last model finishes', async () => {
    const { controller } = await harness(MISSING_BOTH(), { language: 'en' });
    await controller.start();
    render(ModelsScreen, withController(controller));

    await fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(controller.screen).toBe('import-book'));
    controller.destroy();
  });

  it('says the download is complete and being checked, with a moving indicator and no cancel', async () => {
    const state = { ...MISSING_CHAT(), stallAtVerify: true };
    const { controller } = await harness(state, { language: 'en' });
    await controller.start();
    render(ModelsScreen, withController(controller));

    await fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    const message = await screen.findByText(
      /Download complete\. BookaLLM is now checking/,
    );
    expect(message.textContent).toContain('This can take a minute');
    expect(message.textContent).toContain('please keep this window open');
    const bar = screen.getByRole('progressbar', { name: 'Download progress' });
    // No value: the bar is indeterminate and moves, instead of sitting at 100%.
    expect(bar.hasAttribute('value')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(plain(document.body.textContent)).not.toContain('100%');
    controller.cancelDownload();
    controller.destroy();
  });

  it('says the same in French', async () => {
    const state = { ...MISSING_CHAT(), stallAtVerify: true };
    const { controller } = await harness(state, { language: 'fr' });
    await controller.start();
    render(ModelsScreen, withController(controller));

    await fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));

    const message = await screen.findByText(
      /Téléchargement terminé\. BookaLLM vérifie/,
    );
    expect(message.textContent).toContain('gardez cette fenêtre ouverte');
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    controller.cancelDownload();
    controller.destroy();
  });

  it('keeps saying it is finishing until the check ends, and never shows the download button again', async () => {
    const state = MISSING_CHAT();
    const { controller } = await harness(state, { language: 'en' });
    await controller.start();
    render(ModelsScreen, withController(controller));
    let release!: () => void;
    state.versionGate = new Promise<void>((resolve) => (release = resolve));

    await fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    // The pull has finished, but the check that follows is still waiting.
    expect(await screen.findByText('All done. Moving on…')).toBeTruthy();
    expect(controller.screen).toBe('pull-models');
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    release();
    await waitFor(() => expect(controller.screen).toBe('import-book'));
    controller.destroy();
  });

  it('is in French while downloading', async () => {
    const state = { ...MISSING_CHAT(), stallPulls: true };
    const { controller } = await harness(state, { language: 'fr' });
    await controller.start();
    render(ModelsScreen, withController(controller));

    await fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));

    expect(
      await screen.findByText('Téléchargement de llama3.1:8b…'),
    ).toBeTruthy();
    expect(plain(document.body.textContent)).toContain('30 Mo sur 100 Mo');
    controller.cancelDownload();
    controller.destroy();
  });
});

describe('ModelsScreen: every failure has a plain message and a retry', () => {
  async function failing(state: OllamaState) {
    const context = await harness(state, { language: 'en' });
    await context.controller.start();
    render(ModelsScreen, withController(context.controller));
    await fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    return context;
  }

  it('says Ollama seems to have stopped when the connection drops', async () => {
    const { controller } = await failing({
      ...MISSING_CHAT(),
      dropPulls: true,
    });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Ollama seems to have stopped',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    controller.destroy();
  });

  it('asks the reader to check an unknown model name, and opens the name fields', async () => {
    const { controller } = await failing({
      ...MISSING_CHAT(),
      pullErrors: { 'llama3.1:8b': 'pull model manifest: file does not exist' },
    });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'does not have a model called “llama3.1:8b”',
    );
    expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    controller.destroy();
  });

  it('asks the reader to free some disk space', async () => {
    const { controller } = await failing({
      ...MISSING_CHAT(),
      pullErrors: { 'llama3.1:8b': 'write blob: no space left on device' },
    });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'not enough free space',
    );
    controller.destroy();
  });

  it('says the download did not finish and offers Ollama’s message under details', async () => {
    const { controller } = await failing({
      ...MISSING_CHAT(),
      pullErrors: { 'llama3.1:8b': 'unexpected EOF' },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The download did not finish.');
    expect(screen.getByText('Details')).toBeTruthy();
    expect(alert.querySelector('pre')?.textContent).toBe('unexpected EOF');
    controller.destroy();
  });

  it('retries and finishes once the cause is fixed', async () => {
    const state: OllamaState = {
      ...MISSING_CHAT(),
      pullErrors: { 'llama3.1:8b': 'unexpected EOF' },
    };
    const { controller } = await failing(state);
    await screen.findByRole('alert');

    delete state.pullErrors;
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(controller.screen).toBe('import-book'));
    controller.destroy();
  });

  it('shows the messages in French', async () => {
    const context = await harness(
      {
        ...MISSING_CHAT(),
        pullErrors: { 'llama3.1:8b': 'write blob: no space left on device' },
      },
      { language: 'fr' },
    );
    await context.controller.start();
    render(ModelsScreen, withController(context.controller));

    await fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'pas assez de place libre',
    );
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    context.controller.destroy();
  });
});
