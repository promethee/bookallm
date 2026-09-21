import { expect, test, type Page } from '@playwright/test';
import {
  chaptersFile,
  mockOllama,
  newMock,
  READY,
  type MockOllama,
} from './support';

const LATER = { timeout: 15_000 };

/** The distinct models that have vectors saved in the app's IndexedDB. */
const vectorModels = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('bookallm');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction('vectors')
            .objectStore('vectors')
            .getAllKeys();
          request.onsuccess = () => {
            db.close();
            const keys = request.result as [string, string, number][];
            resolve([...new Set(keys.map((key) => key[1]))].sort());
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );

const embedBodies = (requests: { path: string; body?: string }[]) =>
  requests
    .filter((request) => request.path === '/api/embed')
    .map(
      (request) =>
        JSON.parse(request.body!) as { model: string; input: string[] },
    );

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

/** Confirms the language and gives the app a book, ending on whatever comes next. */
async function importBook(page: Page, chapters: number, title = 'Candide') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'Add a book')).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles(chaptersFile(title, chapters, 'candide.epub'));
}

test.describe('indexing a book', () => {
  test('shows real progress, then the "Book added" summary', async ({
    page,
  }) => {
    const ollama: MockOllama = { ...READY(), embedDelayMs: 400 };
    await mockOllama(page, ollama);
    // Records every percentage the page shows, however briefly.
    await page.addInitScript(() => {
      const seen = new Set<string>();
      (window as unknown as { __percents: Set<string> }).__percents = seen;
      new MutationObserver(() => {
        const text = document.body?.innerText ?? '';
        for (const match of text.matchAll(/\d+\.\d\d%/g)) seen.add(match[0]);
      }).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });

    await importBook(page, 4);

    await expect(heading(page, 'Getting to know your book')).toBeVisible(LATER);
    await expect(page.getByText(/Chapter \d of 4/)).toBeVisible();
    const bar = page.getByRole('progressbar', { name: 'Preparation progress' });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('max', '4');
    await expect(heading(page, 'Book added')).toBeVisible(LATER);
    // One chunk per chapter here, so the percentage climbed in steps of 25.00%. Each step
    // is on screen only briefly, so it was recorded as it appeared.
    const seen = await page.evaluate(() => [
      ...(window as unknown as { __percents: Set<string> }).__percents,
    ]);
    expect(seen).toEqual(
      expect.arrayContaining(['0.00%', '25.00%', '50.00%', '75.00%']),
    );
    await expect(page.getByText('Candide', { exact: true })).toBeVisible();
    expect(embedBodies(ollama.requests)).toHaveLength(4);
    expect(await vectorModels(page)).toEqual(['bge-m3:latest']);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(heading(page, 'BookaLLM')).toBeVisible();
  });

  test('keeps the finished chapters when Ollama stops, and resumes the rest after a restart', async ({
    page,
  }) => {
    const ollama: MockOllama = { ...READY(), embedDropAfter: 2 };
    await mockOllama(page, ollama);
    await importBook(page, 5);

    await expect(page.getByRole('alert')).toContainText(
      'Ollama seems to have stopped',
      LATER,
    );
    expect(await vectorModels(page)).toEqual(['bge-m3:latest']);

    // Ollama works again and the app is closed and reopened.
    ollama.embedDropAfter = undefined;
    ollama.requests.length = 0;
    await page.reload();

    await expect(heading(page, 'BookaLLM')).toBeVisible(LATER);
    const sent = embedBodies(ollama.requests).flatMap((body) => body.input);
    expect(sent).toHaveLength(3);
    expect(sent.join(' ')).toContain('chapter 3');
    expect(sent.join(' ')).not.toContain('chapter 1 ');
    await expect(page.getByText('Candide', { exact: true })).toBeVisible();
  });

  test('says it is continuing when it resumes part-way', async ({ page }) => {
    const ollama: MockOllama = { ...READY(), embedDropAfter: 2 };
    await mockOllama(page, ollama);
    await importBook(page, 5);
    await expect(page.getByRole('alert')).toBeVisible(LATER);

    ollama.embedDropAfter = undefined;
    ollama.embedDelayMs = 700;
    await page.reload();

    await expect(page.getByText('Continuing where it stopped.')).toBeVisible(
      LATER,
    );
    await expect(page.getByText(/Chapter 3 of 5/)).toBeVisible();
    await expect(heading(page, 'BookaLLM')).toBeVisible(LATER);
  });

  test('indexes a book that was left without an index at the next start', async ({
    page,
  }) => {
    const ollama: MockOllama = { ...READY(), embedDropAfter: 0 };
    await mockOllama(page, ollama);
    await importBook(page, 3);
    await expect(page.getByRole('alert')).toBeVisible(LATER);
    expect(await vectorModels(page)).toEqual([]);

    ollama.embedDropAfter = undefined;
    await page.reload();

    await expect(heading(page, 'BookaLLM')).toBeVisible(LATER);
    expect(await vectorModels(page)).toEqual(['bge-m3:latest']);
  });

  test('offers to try again after a failure and then finishes', async ({
    page,
  }) => {
    const ollama: MockOllama = { ...READY(), embedDropAfter: 0 };
    await mockOllama(page, ollama);
    await importBook(page, 3);
    await expect(page.getByRole('alert')).toContainText(
      'Ollama seems to have stopped',
      LATER,
    );

    ollama.embedDropAfter = undefined;
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(heading(page, 'Book added')).toBeVisible(LATER);
    expect(await vectorModels(page)).toEqual(['bge-m3:latest']);
  });
});

test.describe('changing the search model', () => {
  test('rebuilds the index with the new model and then drops the old one', async ({
    page,
  }) => {
    const ollama = READY();
    await mockOllama(page, ollama);
    await importBook(page, 3);
    await expect(heading(page, 'Book added')).toBeVisible(LATER);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(heading(page, 'BookaLLM')).toBeVisible();
    expect(await vectorModels(page)).toEqual(['bge-m3:latest']);

    // The old search model goes away and the reader picks another that is installed.
    ollama.installed = ['llama3.1:8b', 'nomic-embed-text:latest'];
    ollama.embedDelayMs = 500;
    ollama.requests.length = 0;
    await page.reload();
    await expect(heading(page, 'Download the AI models')).toBeVisible(LATER);
    await page.getByText('Use different models (advanced)').click();
    await page.getByLabel('Search model').fill('nomic-embed-text');
    await page.getByLabel('Search model').press('Tab');

    await expect(
      page.getByText(
        'The search model was changed, so BookaLLM is getting to know this book again.',
      ),
    ).toBeVisible(LATER);
    await expect(heading(page, 'BookaLLM')).toBeVisible(LATER);
    expect(await vectorModels(page)).toEqual(['nomic-embed-text:latest']);
    expect(
      new Set(embedBodies(ollama.requests).map((body) => body.model)),
    ).toEqual(new Set(['nomic-embed-text']));
  });
});

test('starts with the ordinary flow when there is no book to index', async ({
  page,
}) => {
  const ollama = newMock({
    version: '0.34.0',
    installed: ['llama3.1:8b', 'bge-m3:latest'],
  });
  await mockOllama(page, ollama);

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(heading(page, 'Add a book')).toBeVisible();
  expect(embedBodies(ollama.requests)).toHaveLength(0);
});
