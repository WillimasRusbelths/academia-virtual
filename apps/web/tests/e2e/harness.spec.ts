import { expect, test } from '@playwright/test';

test('Chromium abre el build mínimo servido en loopback', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Academia virtual' })).toBeVisible();
  await expect(page.getByText('En preparación.')).toBeVisible();
});
