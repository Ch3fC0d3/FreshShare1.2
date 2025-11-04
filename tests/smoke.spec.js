// tests/smoke.spec.js
const { test, expect } = require('@playwright/test');

test('home loads, key pages respond', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await expect(page).toHaveTitle(/Freshshare|FreshShare|Dashboard/i);

  // hit a few public routes your app likely has:
  for (const path of ['/', '/login', '/register']) {
    const res = await page.goto(`http://127.0.0.1:3000${path}`);
    expect(res.status()).toBeLessThan(400);
  }
});
