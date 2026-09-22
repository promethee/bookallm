import { expect, test, type Page } from '@playwright/test';
import { chaptersFile, mockOllama, READY, type MockOllama } from './support';

const LATER = { timeout: 15_000 };

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

/** Imports a `chapters`-chapter book and lands on it, ready to ask questions. */
async function landOnBook(page: Page, chapters = 3, title = 'Candide') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'Add a book')).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles(chaptersFile(title, chapters, 'candide.epub'));
  await expect(heading(page, 'Book added')).toBeVisible(LATER);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'BookaLLM')).toBeVisible();
}

const ask = async (page: Page, question: string) => {
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
};

test.describe('asking a question', () => {
  test('shows the streamed answer and a citation with its chapter and passage', async ({
    page,
  }) => {
    const ollama = READY();
    const question = 'Which chapter tells of the second event?';
    // The toy fake embedding used for e2e (8 numbers, word-hash based) does not reliably
    // tell "chapter 2" from "chapter 3" apart with so little vocabulary to work with; pin
    // chapter 2's chunk and the question to the same vector so chapter 2 wins for sure.
    ollama.embedFixed = {
      'Chapter 2\n\nWords of chapter 2 tell of event 2.': [
        1, 0, 0, 0, 0, 0, 0, 0,
      ],
      [question]: [1, 0, 0, 0, 0, 0, 0, 0],
    };
    await mockOllama(page, ollama);
    await landOnBook(page, 3);

    await ask(page, question);

    await expect(page.getByText(question)).toBeVisible();
    await expect(page.getByText(/^Answer: .*\[1\]/)).toBeVisible(LATER);
    await expect(page.getByText('Sources')).toBeVisible();
    await expect(page.getByText('[1] Chapter 2')).toBeVisible();
    await expect(
      page.getByText(/Words of chapter 2 tell of event 2\./),
    ).toBeVisible();
  });

  test('says nothing was found for a question unrelated to the book', async ({
    page,
  }) => {
    const ollama = READY();
    const question = 'How does photosynthesis work in green plants?';
    // The toy fake embedding has too few dimensions to reliably score an unrelated
    // question below the (real-model-tuned) cutoff by chance; pin it to a zero vector,
    // which scores 0 against everything, so "nothing relevant" is guaranteed here.
    ollama.embedFixed = { [question]: [0, 0, 0, 0, 0, 0, 0, 0] };
    await mockOllama(page, ollama);
    await landOnBook(page, 3);

    await ask(page, question);

    await expect(
      page.getByText(
        'I can’t find anything about that: could you tell me where in the book that comes up?',
      ),
    ).toBeVisible(LATER);
    await expect(page.getByText('Sources')).toHaveCount(0);
  });
});

test.describe('stopping and retrying', () => {
  test('stops a pending answer and can ask another one at once', async ({
    page,
  }) => {
    const ollama: MockOllama = { ...READY(), chatDelayMs: 3000 };
    await mockOllama(page, ollama);
    await landOnBook(page, 1);

    await ask(page, 'Words of chapter 1 tell of which event?');

    await expect(
      page.getByText(
        'Getting the AI ready. The first answer can take a few minutes.',
      ),
    ).toBeVisible(LATER);
    await page.getByRole('button', { name: 'Stop' }).click();

    await expect(
      page.getByRole('button', { name: 'Ask', exact: true }),
    ).toBeVisible();
    ollama.chatDelayMs = undefined;
    await ask(page, 'Words of chapter 1 tell of which event, again?');
    await expect(page.getByText('Sources')).toBeVisible(LATER);
  });

  test('shows a failed turn and succeeds on retry', async ({ page }) => {
    const ollama: MockOllama = { ...READY(), chatDropAfter: 0 };
    await mockOllama(page, ollama);
    await landOnBook(page, 1);

    await ask(page, 'Words of chapter 1 tell of which event?');

    await expect(page.getByRole('alert')).toContainText(
      'Ollama seems to have stopped',
      LATER,
    );
    ollama.chatDropAfter = undefined;

    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByText('Sources')).toBeVisible(LATER);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('the conversation resets', () => {
  test('clears after a reload of the same book', async ({ page }) => {
    const ollama = READY();
    await mockOllama(page, ollama);
    await landOnBook(page, 1);
    await ask(page, 'Words of chapter 1 tell of which event?');
    await expect(page.getByText('Sources')).toBeVisible(LATER);

    await page.reload();

    await expect(heading(page, 'BookaLLM')).toBeVisible();
    await expect(
      page.getByText('Words of chapter 1 tell of which event?'),
    ).toHaveCount(0);
  });

  test('clears when a different book becomes active', async ({ page }) => {
    const ollama = READY();
    await mockOllama(page, ollama);
    await landOnBook(page, 1, 'First Book');
    await ask(page, 'Words of chapter 1 tell of which event?');
    await expect(page.getByText('Sources')).toBeVisible(LATER);

    await page.getByRole('button', { name: 'Import a book' }).click();
    await expect(heading(page, 'Add a book')).toBeVisible();
    await page
      .locator('input[type="file"]')
      .setInputFiles(chaptersFile('Second Book', 1, 'second.epub'));
    await expect(heading(page, 'Book added')).toBeVisible(LATER);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(heading(page, 'BookaLLM')).toBeVisible();
    await expect(
      page.getByText('Words of chapter 1 tell of which event?'),
    ).toHaveCount(0);
  });
});
