// tests/a11y.spec.js
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('homepage has no serious axe violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .disableRules(['landmark-one-main', 'region']) // Ignore moderate violations
    .analyze();
  
  // Filter to only serious and critical violations
  const seriousViolations = results.violations.filter(
    v => v.impact === 'serious' || v.impact === 'critical'
  );
  
  expect(seriousViolations).toEqual([]);
});
