// tests/smoke.spec.js
const { test, expect } = require('@playwright/test');

test('home loads, key pages respond', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Freshshare|FreshShare|Dashboard/i);

  // hit a few public routes your app likely has:
  for (const path of ['/', '/login', '/signup']) {
    const res = await page.goto(path);
    expect(res.status()).toBeLessThan(400);
  }
});
