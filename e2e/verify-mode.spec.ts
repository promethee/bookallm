import { expect, test, type Page } from '@playwright/test';
import { chaptersFile, mockOllama, READY, type MockOllama } from './support';

const LATER = { timeout: 15_000 };

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

/** Imports a one-chapter book and lands on it. */
async function landOnBook(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'Add a book')).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles(chaptersFile('Candide', 1, 'candide.epub'));
  await expect(heading(page, 'Book added')).toBeVisible(LATER);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'BookaLLM')).toBeVisible();
}

/**
 * The mock's claims start with `Claim:` when true and `Changed:` when changed; which one
 * is shown is random, so the right answer is read from the claim itself.
 */
async function claimIsTrue(page: Page): Promise<boolean> {
  const claim = page.getByText(/^(Claim|Changed): /);
  await expect(claim).toBeVisible(LATER);
  return (await claim.textContent())!.startsWith('Claim:');
}

test.describe('Verify mode', () => {
  test('gets a claim, judges it, and reveals the passage and tally', async ({
    page,
  }) => {
    await mockOllama(page, READY());
    await landOnBook(page);
    await expect(
      page.getByText('Ask mode: answers are cited, check them'),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Verify' }).click();

    await expect(
      page.getByText('Verify mode: the claim below may be false'),
    ).toBeVisible();
    await expect(
      page.getByText('This session: 0 right out of 0'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Give me a claim' }).click();

    const isTrue = await claimIsTrue(page);
    await expect(page.getByText('From the book')).toHaveCount(0);
    await page
      .getByRole('button', { name: isTrue ? 'True' : 'False', exact: true })
      .click();

    await expect(page.getByText('You were right.')).toBeVisible();
    await expect(
      page.getByText(
        isTrue
          ? 'This claim was true.'
          : 'This claim was false. What was changed: who did or said it.',
      ),
    ).toBeVisible();
    await expect(page.getByText('From the book')).toBeVisible();
    await expect(
      page.getByText(/Words of chapter 1 tell of event 1\./).last(),
    ).toBeVisible();
    await expect(
      page.getByText('This session: 1 right out of 1'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Next claim' }),
    ).toBeVisible();
  });

  test('works with the keyboard alone', async ({ page }) => {
    await mockOllama(page, READY());
    await landOnBook(page);

    await page.getByRole('tab', { name: 'Ask' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Verify' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Verify' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Give me a claim' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');

    const isTrue = await claimIsTrue(page);
    const choice = page.getByRole('button', {
      name: isTrue ? 'True' : 'False',
      exact: true,
    });
    await choice.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('You were right.')).toBeVisible();

    await page.getByRole('button', { name: 'Next claim' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'True' })).toBeVisible(LATER);
  });

  test('shows a failure and succeeds on retry', async ({ page }) => {
    const ollama: MockOllama = { ...READY(), chatDropAfter: 0 };
    await mockOllama(page, ollama);
    await landOnBook(page);
    await page.getByRole('tab', { name: 'Verify' }).click();

    await page.getByRole('button', { name: 'Give me a claim' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'Ollama seems to have stopped',
      LATER,
    );
    ollama.chatDropAfter = undefined;
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('button', { name: 'True' })).toBeVisible(LATER);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('opens in Ask mode again after a reload', async ({ page }) => {
    await mockOllama(page, READY());
    await landOnBook(page);
    await page.getByRole('tab', { name: 'Verify' }).click();
    await expect(
      page.getByRole('button', { name: 'Give me a claim' }),
    ).toBeVisible();

    await page.reload();

    await expect(page.getByRole('tab', { name: 'Ask' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Your question')).toBeVisible();
  });
});
