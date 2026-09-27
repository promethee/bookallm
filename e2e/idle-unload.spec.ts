import { expect, test, type Page } from '@playwright/test';
import { chaptersFile, mockOllama, READY, type MockOllama } from './support';

const LATER = { timeout: 15_000 };

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

/** The `keep_alive` of every request to `path` so far, in order. */
const keepAlives = (ollama: MockOllama, path: string) =>
  ollama.requests
    .filter((request) => request.path === path)
    .map((request) => JSON.parse(request.body ?? '{}').keep_alive);

async function landOnBook(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'Add a book')).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles(chaptersFile('Candide', 2, 'candide.epub'));
  await expect(heading(page, 'Book added')).toBeVisible(LATER);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'BookaLLM')).toBeVisible();
}

const ask = async (page: Page, question: string) => {
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText(/^Answer: /).last()).toBeVisible(LATER);
};

const control = (page: Page) => page.getByLabel('Free memory after');

test.describe('the idle unload time', () => {
  test('is 10 minutes by default on indexing and on questions', async ({
    page,
  }) => {
    const ollama = READY();
    await mockOllama(page, ollama);
    await landOnBook(page);
    await expect(control(page)).toHaveValue('10');

    await ask(page, 'What happens in chapter 1?');

    const embeds = keepAlives(ollama, '/api/embed');
    expect(embeds.length).toBeGreaterThan(0);
    expect(new Set(embeds)).toEqual(new Set(['10m']));
    expect(keepAlives(ollama, '/api/chat')).toEqual(['10m']);
  });

  test('applies a new choice to the next question', async ({ page }) => {
    const ollama = READY();
    await mockOllama(page, ollama);
    await landOnBook(page);
    const before = ollama.requests.length;

    await control(page).selectOption({ label: '5 minutes' });
    expect(ollama.requests.length).toBe(before);
    await ask(page, 'What happens in chapter 2?');

    expect(keepAlives(ollama, '/api/chat').at(-1)).toBe('5m');
  });

  test('is remembered after a reload', async ({ page }) => {
    await mockOllama(page, READY());
    await landOnBook(page);

    await control(page).selectOption({ label: '30 minutes' });
    await page.reload();

    await expect(heading(page, 'BookaLLM')).toBeVisible(LATER);
    await expect(control(page)).toHaveValue('30');
  });

  test('can be changed with the keyboard alone', async ({ page }) => {
    const ollama = READY();
    await mockOllama(page, ollama);
    await landOnBook(page);

    await control(page).focus();
    await page.keyboard.press('End');

    await expect(control(page)).toHaveValue('never');
    await ask(page, 'What happens in chapter 1?');
    expect(keepAlives(ollama, '/api/chat').at(-1)).toBe(-1);
  });
});
