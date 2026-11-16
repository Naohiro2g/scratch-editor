// @ts-check
const {test, expect} = require('@playwright/test');

test('the editor loads without an unconfigured Backpack', async ({page}) => {
    // Capture uncaught page exceptions so a broken bundle fails with
    // the actual error rather than a generic visibility timeout.
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));

    await page.goto('index.html');

    await expect(page.locator('.blocklyToolbox')).toBeVisible();
    await expect(page.getByText('Backpack', {exact: true})).toHaveCount(0);
    expect(pageErrors, 'uncaught exceptions during editor load').toEqual([]);
});
