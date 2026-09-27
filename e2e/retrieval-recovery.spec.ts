import { expect, test, type Page } from '@playwright/test';
import {
  mockOllama,
  NOTHING_VECTOR,
  READY,
  recoveryFile,
  type MockOllama,
} from './support';

const LATER = { timeout: 15_000 };
const UNRELATED = 'How does photosynthesis work in green plants?';
const HAND_OVER =
  'I couldn’t find it in this chapter. Here it is, so you can look through it yourself.';

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

/** An Ollama where the unrelated question finds nothing anywhere in the book. */
function nothingFoundOllama(): MockOllama {
  const ollama = READY();
  ollama.embedFixed = { [UNRELATED]: NOTHING_VECTOR };
  return ollama;
}

/** Imports the introduction-and-two-chapters book and lands on it. */
async function landOnBook(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'Add a book')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(recoveryFile());
  await expect(heading(page, 'Book added')).toBeVisible(LATER);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'BookaLLM')).toBeVisible();
}

const ask = async (page: Page, question: string) => {
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
};

async function askNothingFound(page: Page) {
  await ask(page, UNRELATED);
  await expect(page.getByText('Or choose where to look:')).toBeVisible(LATER);
}

test.describe('recovering from nothing found', () => {
  test('answers from a chapter chosen in the list, with its citation', async ({
    page,
  }) => {
    await mockOllama(page, nothingFoundOllama());
    await landOnBook(page);
    await askNothingFound(page);

    await page
      .getByLabel('Chapter', { exact: true })
      .selectOption({ label: 'Chapter 2' });
    await page.getByRole('button', { name: 'Look in this chapter' }).click();

    await expect(
      page.getByText(`Looking in “Chapter 2”: ${UNRELATED}`),
    ).toBeVisible();
    await expect(page.getByText('[1] Chapter 2')).toBeVisible(LATER);
    await expect(page.getByText(/Candide reached Lisbon/)).toBeVisible();
    await expect(page.getByLabel('Chapter', { exact: true })).toHaveCount(0);
  });

  test('reads a typed chapter number from the titles, not the list position', async ({
    page,
  }) => {
    await mockOllama(page, nothingFoundOllama());
    await landOnBook(page);
    await askNothingFound(page);

    await ask(page, 'try chapter 1');

    await expect(
      page.getByText(`Looking in “Chapter 1”: ${UNRELATED}`),
    ).toBeVisible(LATER);
    await expect(page.getByText('[1] Chapter 1')).toBeVisible(LATER);
  });

  test('offers the list again when a typed chapter is unclear', async ({
    page,
  }) => {
    await mockOllama(page, nothingFoundOllama());
    await landOnBook(page);
    await askNothingFound(page);

    await ask(page, 'chapter 9');

    await expect(
      page.getByText(
        'I couldn’t tell which chapter you meant. Choose it below.',
      ),
    ).toBeVisible();
    await expect(page.getByLabel('Chapter', { exact: true })).toHaveCount(2);
  });

  test('hands over the chapter when the retry cites nothing, and it collapses', async ({
    page,
  }) => {
    const ollama = nothingFoundOllama();
    await mockOllama(page, ollama);
    await landOnBook(page);
    await askNothingFound(page);
    ollama.chatChunks = ['These passages do not say.'];

    await page
      .getByLabel('Chapter', { exact: true })
      .selectOption({ label: 'Chapter 2' });
    await page.getByRole('button', { name: 'Look in this chapter' }).click();

    await expect(page.getByText(HAND_OVER)).toBeVisible(LATER);
    const chapter = page.getByRole('region', { name: 'Chapter 2' });
    await expect(chapter).toContainText('Candide reached Lisbon');

    const title = page.locator('summary', { hasText: 'Chapter 2' });
    await title.click();
    await expect(chapter).toBeHidden();
    await title.click();
    await expect(chapter).toBeVisible();
    await expect(page.getByLabel('Chapter', { exact: true })).toHaveCount(0);
  });

  test('works with the keyboard alone', async ({ page }) => {
    const ollama = nothingFoundOllama();
    await mockOllama(page, ollama);
    await landOnBook(page);
    ollama.chatChunks = ['Nothing cited here.'];

    await page.getByLabel('Your question').focus();
    await page.keyboard.type(UNRELATED);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Or choose where to look:')).toBeVisible(LATER);

    // From the question field: past the Ask button to the chapter list.
    const list = page.getByLabel('Chapter', { exact: true });
    while (!(await list.evaluate((el) => el === document.activeElement)))
      await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(list).toHaveValue('3');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Look in this chapter' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');

    const chapter = page.getByRole('region', { name: 'Chapter 2' });
    await expect(chapter).toBeVisible(LATER);
    const title = page.locator('summary', { hasText: 'Chapter 2' });
    await title.focus();
    await page.keyboard.press('Enter');
    await expect(chapter).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(chapter).toBeVisible();
    await chapter.focus();
    await expect(chapter).toBeFocused();
  });
});
