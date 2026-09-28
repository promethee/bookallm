import { expect, test, type Page } from '@playwright/test';
import { chaptersFile, mockOllama, READY } from './support';

const LATER = { timeout: 15_000 };

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

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

// The tray itself exists only in the desktop app (see MANUAL_TESTS.md); in the browser
// the option is saved and has no other effect.
const option = (page: Page) =>
  page.getByLabel('Keep running in the tray when closed');

test.describe('the tray option', () => {
  test('is on by default', async ({ page }) => {
    await mockOllama(page, READY());
    await landOnBook(page);

    await expect(option(page)).toBeChecked();
  });

  test('stays off after a reload once turned off', async ({ page }) => {
    await mockOllama(page, READY());
    await landOnBook(page);

    await option(page).uncheck();
    await page.reload();

    await expect(heading(page, 'BookaLLM')).toBeVisible(LATER);
    await expect(option(page)).not.toBeChecked();
  });

  test('can be toggled with the keyboard alone', async ({ page }) => {
    await mockOllama(page, READY());
    await landOnBook(page);

    await option(page).focus();
    await page.keyboard.press('Space');
    await expect(option(page)).not.toBeChecked();
    await page.keyboard.press('Space');
    await expect(option(page)).toBeChecked();
  });
});
