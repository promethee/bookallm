import { expect, test } from '@playwright/test';

test('a first launch opens on the language choice', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Choose your language|Choisissez votre langue/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Continue|Continuer/ }),
  ).toBeVisible();
});
