// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import type { RecordedRequest } from '../ollama/testing/fake-fetch';
import { bookOf, harness, READY } from './testing/harness';

beforeEach(() => setLanguage('en'));

/** The `keep_alive` of every request to `path`, in order. */
const keepAlives = (requests: RecordedRequest[], path: string) =>
  requests
    .filter((request) => request.path === path)
    .map((request) => JSON.parse(request.body ?? '{}').keep_alive);

async function readyBook() {
  const book = await bookOf('Candide', 'Candide reached Lisbon.');
  const context = await harness(
    { ...READY },
    { language: 'en', books: [book], indexed: true },
  );
  await context.controller.start();
  return { ...context, book };
}

describe('every model request carries the idle unload time', () => {
  it('sends the 10-minute default with a question', async () => {
    const { controller, fake, book } = await readyBook();

    await controller.askQuestion(book.chunks[0].text);

    expect(keepAlives(fake.requests, '/api/embed')).toEqual(['10m']);
    expect(keepAlives(fake.requests, '/api/chat')).toEqual(['10m']);
    controller.destroy();
  });

  it('sends it with every step of a Verify claim', async () => {
    const { controller, fake } = await readyBook();
    controller.setIdleUnload(30);

    await controller.requestClaim();

    const sent = keepAlives(fake.requests, '/api/chat');
    expect(sent.length).toBeGreaterThan(0);
    expect(new Set(sent)).toEqual(new Set(['30m']));
    controller.destroy();
  });

  it('sends it while indexing a book', async () => {
    const book = await bookOf('Candide', 'Candide reached Lisbon.');
    const { controller, fake } = await harness(
      { ...READY },
      { language: 'en', books: [book] },
    );
    controller.setIdleUnload('never');

    await controller.start();

    const sent = keepAlives(fake.requests, '/api/embed');
    expect(sent.length).toBeGreaterThan(0);
    expect(new Set(sent)).toEqual(new Set([-1]));
    controller.destroy();
  });

  it('sends it with the hardware check', async () => {
    const { controller, fake } = await harness(
      { ...READY },
      { language: 'en', hardwareCheckResolved: false },
    );
    controller.setIdleUnload(5);

    await controller.start();

    expect(keepAlives(fake.requests, '/api/embed')).toEqual(['5m']);
    controller.destroy();
  });
});

describe('changing the idle unload time', () => {
  it('is saved', async () => {
    const { controller, settings } = await readyBook();

    controller.setIdleUnload(30);

    expect(settings.load().idleUnload).toBe(30);
    expect(controller.settings.idleUnload).toBe(30);
    controller.destroy();
  });

  it('applies to the next request', async () => {
    const { controller, fake, book } = await readyBook();
    await controller.askQuestion(book.chunks[0].text);

    controller.setIdleUnload(5);
    await controller.askQuestion(book.chunks[0].text);

    expect(keepAlives(fake.requests, '/api/chat')).toEqual(['10m', '5m']);
    controller.destroy();
  });

  it('sends nothing by itself', async () => {
    const { controller, fake } = await readyBook();
    const before = fake.requests.length;

    controller.setIdleUnload('never');

    expect(fake.requests.length).toBe(before);
    controller.destroy();
  });
});
