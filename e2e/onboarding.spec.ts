import { expect, test, type Page } from '@playwright/test';
import { epubFile, mockOllama, newMock, READY } from './support';

const LATER = { timeout: 15_000 };
const DROP = 'Drop an EPUB here, or choose a file';

/** How many books the app has saved, read straight from the browser's IndexedDB. */
const savedBooks = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('bookallm');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction('registry')
            .objectStore('registry')
            .count();
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );

/** Confirms the language and imports a first book, ending on the landing screen. */
async function reachLanding(page: Page, title = 'Candide') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add a book' }),
  ).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles(epubFile(title, 'Edition one.', {}, 'candide.epub'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'BookaLLM' }),
  ).toBeVisible();
}

test.describe('the first launch, start to finish', () => {
  test('walks from the language choice to the landing screen', async ({
    page,
  }) => {
    // Ollama is not running at first, and the chat model is missing once it is.
    const ollama = newMock();
    await mockOllama(page, ollama);
    await page.goto('/');

    // 1. Language
    await expect(
      page.getByRole('heading', { level: 1, name: 'Choose your language' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 2. Ollama is not there: guidance is shown and pressing "Check again" does not advance
    await expect(
      page.getByRole('heading', { level: 1, name: /Let.s get Ollama running/ }),
    ).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(4);
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /Let.s get Ollama running/ }),
    ).toBeVisible();

    // 3. Ollama starts: the screen moves on by itself
    ollama.version = '0.34.0';
    ollama.installed = ['bge-m3:latest'];
    await expect(
      page.getByRole('heading', { level: 1, name: 'Download the AI models' }),
    ).toBeVisible(LATER);
    await expect(page.getByRole('list')).toContainText(
      /llama3\.1:8b: about 4\.9\s*GB/,
    );
    await expect(
      page.getByText(/Nothing is downloaded until you press the button/),
    ).toBeVisible();
    expect(ollama.requests.some((request) => request.method === 'POST')).toBe(
      false,
    );

    // 4. Download, then move on by itself
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Add a book' }),
    ).toBeVisible(LATER);
    expect(ollama.installed).toContain('llama3.1:8b');

    // 5. Import a generated EPUB
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        epubFile('Candide', 'Il était une fois.', {}, 'candide.epub'),
      );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Book added' }),
    ).toBeVisible();
    await expect(page.getByText('Candide', { exact: true })).toBeVisible();
    await expect(page.getByText('by Someone')).toBeVisible();

    // 6. Landing
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'BookaLLM' }),
    ).toBeVisible();
    await expect(
      page.getByText('Ask mode — answers are cited, check them'),
    ).toBeVisible();
    await expect(page.getByText('Candide', { exact: true })).toBeVisible();
  });
});

test.describe('after the first launch', () => {
  test('remembers the language and the book after a reload', async ({
    page,
  }) => {
    await mockOllama(page, READY());
    await page.goto('/');
    await page.getByRole('radio', { name: 'Français' }).check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ajouter un livre' }),
    ).toBeVisible();
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        epubFile('Candide', 'Il était une fois.', {}, 'candide.epub'),
      );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Livre ajouté' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'BookaLLM' }),
    ).toBeVisible();

    await page.reload();

    await expect(
      page.getByRole('heading', { level: 1, name: 'BookaLLM' }),
    ).toBeVisible();
    await expect(
      page.getByText('Mode Question — les réponses sont citées, vérifiez-les'),
    ).toBeVisible();
    await expect(page.getByText('Candide', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Choisissez votre langue' }),
    ).toHaveCount(0);
    expect(await savedBooks(page)).toBe(1);
  });

  test('a returning reader lands directly, and sees the setup step again if Ollama has stopped', async ({
    page,
  }) => {
    const ollama = READY();
    await mockOllama(page, ollama);
    await reachLanding(page);

    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'BookaLLM' }),
    ).toBeVisible();

    ollama.version = undefined;
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: /Let.s get Ollama running/ }),
    ).toBeVisible();
  });

  test('remembers swapped model names after a reload, without downloading anything', async ({
    page,
  }) => {
    const ollama = newMock({
      version: '0.34.0',
      installed: ['bge-m3:latest', 'qwen2.5:3b'],
    });
    await mockOllama(page, ollama);
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Download the AI models' }),
    ).toBeVisible();

    await page.getByText('Use different models (advanced)').click();
    await page.getByLabel('Answering model').fill('qwen2.5:3b');
    await page.getByLabel('Answering model').press('Tab');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Add a book' }),
    ).toBeVisible();

    await page.reload();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Add a book' }),
    ).toBeVisible();
    expect(ollama.requests.some((request) => request.method === 'POST')).toBe(
      false,
    );
  });

  test('recognises a book that was already imported, without adding it again', async ({
    page,
  }) => {
    await mockOllama(page, READY());
    await reachLanding(page);
    await page.getByRole('button', { name: 'Import a book' }).click();

    await page
      .locator('input[type="file"]')
      .setInputFiles(
        epubFile('Candide', 'Edition one.', {}, 'copy-of-candide.epub'),
      );

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'You already have this book',
      }),
    ).toBeVisible();
    expect(await savedBooks(page)).toBe(1);
  });
});

test.describe('language', () => {
  test('can be switched in the middle of the setup without losing progress', async ({
    page,
  }) => {
    const ollama = newMock();
    await mockOllama(page, ollama);
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /Let.s get Ollama running/ }),
    ).toBeVisible();

    await page.getByLabel('Language').selectOption('fr');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Mettons Ollama en marche' }),
    ).toBeVisible();
    ollama.version = '0.34.0';
    ollama.installed = ['llama3.1:8b', 'bge-m3:latest'];
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ajouter un livre' }),
    ).toBeVisible(LATER);
  });
});

test.describe('importing', () => {
  test('asks about a possible duplicate, saves nothing on cancel, and keeps both books when added separately', async ({
    page,
  }) => {
    await mockOllama(page, READY());
    await reachLanding(page);
    expect(await savedBooks(page)).toBe(1);

    await page.getByRole('button', { name: 'Import a book' }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        epubFile('Candide', 'A different edition.', {}, 'candide-2.epub'),
      );
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Is this a book you already have?',
      }),
    ).toBeVisible();
    await expect(page.getByText('The file you chose')).toBeVisible();
    await expect(page.getByText('Already in BookaLLM')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Add a book' }),
    ).toBeVisible();
    expect(await savedBooks(page)).toBe(1);

    await page
      .locator('input[type="file"]')
      .setInputFiles(
        epubFile('Candide', 'A different edition.', {}, 'candide-2.epub'),
      );
    await page.getByRole('button', { name: 'Add as a separate book' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Book added' }),
    ).toBeVisible();
    expect(await savedBooks(page)).toBe(2);
  });

  test('explains a protected book and saves nothing', async ({ page }) => {
    await mockOllama(page, READY());
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Add a book' }),
    ).toBeVisible();

    await page
      .locator('input[type="file"]')
      .setInputFiles(
        epubFile(
          'Locked',
          'Text.',
          { files: { 'META-INF/rights.xml': '<rights/>' } },
          'locked.epub',
        ),
      );

    await expect(page.getByRole('alert')).toContainText(
      'protected against copying (DRM)',
    );
    await expect(page.getByRole('alert')).toContainText(
      'never removes that protection',
    );
    expect(await savedBooks(page)).toBe(0);
    await page.getByRole('button', { name: 'Try another file' }).click();
    await expect(page.getByRole('button', { name: DROP })).toBeVisible();
  });

  test('accepts a book dropped on the drop area', async ({ page }) => {
    await mockOllama(page, READY());
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();
    const book = epubFile('Dropped', 'By hand.', {}, 'dropped.epub');
    const dataTransfer = await page.evaluateHandle(
      ({ base64, name }) => {
        const transfer = new DataTransfer();
        const bytes = Uint8Array.from(atob(base64), (char) =>
          char.charCodeAt(0),
        );
        transfer.items.add(
          new File([bytes], name, { type: 'application/epub+zip' }),
        );
        return transfer;
      },
      { base64: book.buffer.toString('base64'), name: book.name },
    );

    await page
      .getByRole('button', { name: DROP })
      .dispatchEvent('drop', { dataTransfer });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Book added' }),
    ).toBeVisible();
    await expect(page.getByText('Dropped', { exact: true })).toBeVisible();
  });
});

test.describe('starting up', () => {
  test('shows a splash while the app loads, then replaces it', async ({
    page,
  }) => {
    await mockOllama(page, newMock());
    // Hold the app's script back, as a slow window start would.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/src/main.ts*', async (route) => {
      await held;
      await route.continue();
    });

    await page.goto('/', { waitUntil: 'commit' });
    const splash = page.getByRole('status').filter({ hasText: 'BookaLLM' });
    await expect(splash).toBeVisible();
    await expect(splash).toContainText('Starting…');

    release();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Choose your language' }),
    ).toBeVisible();
    await expect(page.locator('#splash')).toHaveCount(0);
  });

  test('speaks French from the first paint when the system is French', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'fr-FR' });
    const page = await context.newPage();
    await mockOllama(page, newMock());
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/src/main.ts*', async (route) => {
      await held;
      await route.continue();
    });

    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#splash')).toContainText('Démarrage…');
    release();
    await expect(page.locator('#splash')).toHaveCount(0);
    await context.close();
  });
});
