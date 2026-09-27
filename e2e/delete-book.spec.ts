import { expect, test, type Page } from '@playwright/test';
import { epubFile, mockOllama, READY } from './support';

const LATER = { timeout: 15_000 };

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

const OLDER = () =>
  epubFile('Older Book', 'The lighthouse keeper watched.', {}, 'older.epub');
const NEWER = () =>
  epubFile('Newer Book', 'Candide reached Lisbon.', {}, 'newer.epub');

/** Imports one book from the "Add a book" screen and lands on it. */
async function importBook(page: Page, file: ReturnType<typeof epubFile>) {
  await expect(heading(page, 'Add a book')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(heading(page, 'Book added')).toBeVisible(LATER);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'BookaLLM')).toBeVisible();
}

/** Starts the app and imports the older book, then the newer, active one. */
async function withTwoBooks(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await importBook(page, OLDER());
  await page.getByRole('button', { name: 'Import a book' }).click();
  await importBook(page, NEWER());
  await expect(page.getByText('Newer Book', { exact: true })).toBeVisible();
}

const DISCLOSURE =
  'This removes BookaLLM’s copy of the book and its index. Your EPUB file stays where it is.';

test.describe('deleting the active book', () => {
  test('asks first, then shows the previous book', async ({ page }) => {
    await mockOllama(page, READY());
    await withTwoBooks(page);

    await page.getByRole('button', { name: 'Delete this book' }).click();
    await expect(page.getByText(DISCLOSURE)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(DISCLOSURE)).toBeHidden();
    await expect(page.getByText('Newer Book', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Delete this book' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('Now showing: Older Book')).toBeVisible();
    await expect(page.getByText('Newer Book', { exact: true })).toHaveCount(0);
  });

  test('lands on "Add a book" after deleting the last book, and a re-import is new', async ({
    page,
  }) => {
    const ollama = READY();
    await mockOllama(page, ollama);
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();
    await importBook(page, NEWER());

    await page.getByRole('button', { name: 'Delete this book' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(heading(page, 'Add a book')).toBeVisible();

    const before = ollama.embedCalls;
    await page.locator('input[type="file"]').setInputFiles(NEWER());
    await expect(heading(page, 'Book added')).toBeVisible(LATER);
    await expect(page.getByText('You already have this book')).toHaveCount(0);
    // Indexed again from scratch: nothing of the deleted book was kept.
    await expect.poll(() => ollama.embedCalls, LATER).toBeGreaterThan(before);
  });

  test('stays deleted after a reload', async ({ page }) => {
    await mockOllama(page, READY());
    await withTwoBooks(page);
    await page.getByRole('button', { name: 'Delete this book' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Now showing: Older Book')).toBeVisible();

    await page.reload();

    await expect(heading(page, 'BookaLLM')).toBeVisible(LATER);
    await expect(page.getByText('Older Book', { exact: true })).toBeVisible();
    await expect(page.getByText('Newer Book', { exact: true })).toHaveCount(0);
  });

  test('works with the keyboard alone', async ({ page }) => {
    await mockOllama(page, READY());
    await withTwoBooks(page);

    const action = page.getByRole('button', { name: 'Delete this book' });
    await action.focus();
    await page.keyboard.press('Enter');
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(action).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Delete', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByText('Now showing: Older Book')).toBeFocused();
  });
});
