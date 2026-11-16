// @ts-check
const {test, expect} = require('@playwright/test');

const placedBlocks = '.blocklySvg .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable';

const collapse = async page => {
    await page.getByText('Code', {exact: true}).dblclick();
    await expect(page.locator('.blocklyFlyout').first()).toBeHidden();
};

test('folded palette keeps categories and extension button, deletes drops, and preserves script position',
    async ({page}) => {
        await page.goto('index.html');
        await page.locator('[data-mcremote-notice-toggle][aria-expanded="true"]').click();
        const toolbox = page.locator('.blocklyToolbox');
        await expect(toolbox).toBeVisible();
        const categoryBox = await toolbox.boundingBox();
        const extension = page.getByRole('button', {name: 'Add Extension', exact: true});
        const extensionBox = await extension.boundingBox();
        const block = await page.evaluate(() => {
            for (const item of document.querySelectorAll('.blocklyFlyout .blocklyDraggable')) {
                const rect = item.getBoundingClientRect();
                const x = rect.x + (rect.width / 2);
                const y = rect.y + (rect.height / 2);
                if (rect.y > 80 && y < window.innerHeight && rect.width > 50 && rect.height > 20 &&
                    item.contains(document.elementFromPoint(x, y))) return {x, y};
            }
            return null;
        });
        expect(block).not.toBeNull();
        await page.mouse.move(block.x, block.y);
        await page.mouse.down();
        await page.mouse.move(block.x + 400, block.y + 100, {steps: 15});
        await page.mouse.up();
        const script = page.locator(placedBlocks);
        await expect(script).toHaveCount(1);
        const before = await script.boundingBox();
        await collapse(page);
        expect(await toolbox.boundingBox()).toEqual(categoryBox);
        expect(await extension.boundingBox()).toEqual(extensionBox);
        const after = await script.boundingBox();
        expect(after.x).toBeCloseTo(before.x, 0);
        expect(after.y).toBeCloseTo(before.y, 0);

        await page.getByText('Code', {exact: true}).dblclick();
        await expect(page.locator('.blocklyFlyout').first()).toBeVisible();
        expect((await script.boundingBox()).x).toBeCloseTo(before.x, 0);
        await collapse(page);

        await page.mouse.move(after.x + 20, after.y + 15);
        await page.mouse.down();
        await page.mouse.move(categoryBox.x + (categoryBox.width / 2), categoryBox.y + 25, {steps: 15});
        await page.mouse.up();
        await expect(script).toHaveCount(0);
        await expect(page.locator('.blocklyFlyout').first()).toBeHidden();
        await page.mouse.click(after.x + 150, after.y + 100);
        await page.keyboard.press('ControlOrMeta+z');
        await expect(script).toHaveCount(1);
    });

test('selected category opens the flyout and only blank category space toggles it', async ({page}) => {
    await page.goto('index.html');
    await page.locator('[data-mcremote-notice-toggle][aria-expanded="true"]').click();
    const toolbox = page.locator('.blocklyToolbox');
    await expect(toolbox).toBeVisible();
    await collapse(page);
    await toolbox.getByRole('treeitem', {name: 'Motion', exact: true}).click();
    await expect(page.locator('.blocklyFlyout').first()).toBeVisible();
    await collapse(page);
    const blank = await toolbox.evaluate(root => {
        const box = root.getBoundingClientRect();
        const x = box.x + (box.width / 2);
        for (let y = box.bottom - 5; y > box.top; y -= 5) {
            const hit = document.elementFromPoint(x, y);
            if (root.contains(hit) && !hit.closest('[role="treeitem"], button')) return {x, y};
        }
        return null;
    });
    expect(blank).not.toBeNull();
    await page.mouse.dblclick(blank.x, blank.y);
    await expect(page.locator('.blocklyFlyout').first()).toBeVisible();
    await page.mouse.dblclick(blank.x, blank.y);
    await expect(page.locator('.blocklyFlyout').first()).toBeHidden();
});
