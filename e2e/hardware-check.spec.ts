import { expect, test, type Page } from '@playwright/test';
import { mockOllama, READY } from './support';

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

test.describe('the hardware warning', () => {
  test('is shown before book import on a non-accelerated machine, and continuing proceeds', async ({
    page,
  }) => {
    const ollama = READY();
    ollama.runningModels = [
      { model: 'bge-m3:latest', size: 1_000_000, size_vram: 0 },
    ];
    await mockOllama(page, ollama, { hardwareCheckResolved: false });

    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(
      heading(page, 'This computer may be slow at this'),
    ).toBeVisible();
    await expect(
      page.getByText(/likely take several minutes each/),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Continue anyway' }).click();

    await expect(heading(page, 'Add a book')).toBeVisible();
  });

  test('never appears on an accelerated machine', async ({ page }) => {
    await mockOllama(page, READY(), { hardwareCheckResolved: false });

    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(heading(page, 'Add a book')).toBeVisible();
    await expect(
      heading(page, 'This computer may be slow at this'),
    ).toHaveCount(0);
  });

  test('does not reappear after a reload once acknowledged', async ({
    page,
  }) => {
    const ollama = READY();
    ollama.runningModels = [
      { model: 'bge-m3:latest', size: 1_000_000, size_vram: 0 },
    ];
    await mockOllama(page, ollama, { hardwareCheckResolved: false });
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      heading(page, 'This computer may be slow at this'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue anyway' }).click();
    await expect(heading(page, 'Add a book')).toBeVisible();

    await page.reload();

    await expect(heading(page, 'Add a book')).toBeVisible();
    await expect(
      heading(page, 'This computer may be slow at this'),
    ).toHaveCount(0);
  });
});
