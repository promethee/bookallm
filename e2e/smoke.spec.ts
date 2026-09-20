import { expect, test } from '@playwright/test';

test('shell renders the app name and Ask mode disclosure', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'BookaLLM' })).toBeVisible();
  await expect(page.getByText('Ask mode')).toBeVisible();
});
