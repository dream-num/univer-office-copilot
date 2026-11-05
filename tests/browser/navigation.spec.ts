import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.locator('.editor-pane').getByRole('button').first()).toBeVisible();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.editor-pane canvas')].some(
      (canvas) => canvas.getBoundingClientRect().height > 300,
    ),
  );
  await expect(page.locator('.editor-error')).toHaveCount(0);
}

test('workspace collapse preserves navigation, editor space, and its preference', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  const sidebar = page.getByRole('navigation', { name: 'Workspace files' });
  const expand = page.getByRole('button', { name: 'Expand workspace', exact: true });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).toHaveCSS('width', '48px');
  const wideEditor = (await page.locator('.office-area').boundingBox())!.width;
  const colors = await page
    .locator('.workspace-sidebar,.copilot-pane')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).backgroundColor),
    );
  expect(colors).toEqual(['rgb(247, 247, 248)', 'rgb(247, 247, 248)']);
  await expect(page.locator('.file-title .product-name-sheet')).toHaveCSS(
    'color',
    'rgb(33, 133, 91)',
  );
  await expand.hover();
  await expect(expand.locator('.panel-handle-arrow')).toHaveCSS('opacity', '1');
  await expect(expand.locator('.panel-handle-tip')).toBeVisible();
  await expand.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Search files')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Collapse workspace', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(wideEditor - (await page.locator('.office-area').boundingBox())!.width).toBeGreaterThan(
    160,
  );
  await page.reload();
  await ready(page);
  await expect(page.getByRole('button', { name: 'Collapse workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse workspace', exact: true }).click();
  await page.reload();
  await ready(page);
  await expect(page.getByRole('button', { name: 'Expand workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Modern document', exact: true }).click();
  await expect(page.locator('.file-title strong')).toHaveText('Untitled document');
  await ready(page);
  await expect(page.locator('.file-title strong')).not.toHaveCSS('color', 'rgb(33, 133, 91)');
  expect(
    await page
      .locator('.workspace-sidebar')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(colors[0]);
  expect(errors).toEqual([]);
});

test.describe('compact screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('keeps the file visible and opens each side panel on demand', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.getByRole('button', { name: 'Open Copilot', exact: true })).toBeVisible();
    expect((await page.locator('.office-area').boundingBox())!.width).toBeGreaterThan(280);
    await page.getByRole('button', { name: 'Expand workspace', exact: true }).click();
    await expect(page.getByLabel('Search files')).toBeVisible();
    await page.getByLabel('Search files').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Expand workspace', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open Copilot', exact: true }).click();
    await expect(page.getByLabel('Message Copilot')).toBeVisible();
    const leftHandle = (await page
      .getByRole('button', { name: 'Expand workspace', exact: true })
      .boundingBox())!;
    const rightHandle = (await page
      .getByRole('button', { name: 'Close Copilot', exact: true })
      .boundingBox())!;
    expect(rightHandle.x).toBeGreaterThanOrEqual(leftHandle.x + leftHandle.width + 8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole('button', { name: 'Close Copilot', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Copilot', exact: true })).toBeVisible();
  });
});

test('resizes Copilot within bounds, preserves the draft, and remembers its width', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  const panel = page.locator('.copilot-container');
  const separator = page.getByRole('separator', { name: 'Resize Copilot panel' });
  const input = page.getByLabel('Message Copilot');
  await expect(separator).toHaveAttribute('aria-valuenow', '336');
  await input.fill('Keep this draft while I resize');
  const bounds = (await separator.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + 100;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 180, y, { steps: 8 });
  await page.mouse.up();
  await expect(separator).toHaveAttribute('aria-valuenow', '516');
  await expect(input).toHaveValue('Keep this draft while I resize');
  await expect(panel).toHaveCSS('width', '516px');
  await expect(page.locator('.model-picker-label')).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(separator).toHaveAttribute('aria-valuenow', '516');
  await separator.focus();
  await page.keyboard.press('End');
  await expect(separator).toHaveAttribute('aria-valuenow', '640');
  await page.keyboard.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', '640');
  await page.keyboard.press('Home');
  await expect(separator).toHaveAttribute('aria-valuenow', '300');
  await page.keyboard.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', '300');
  await expect(page.locator('.model-picker-label')).not.toBeVisible();
  const minimum = (await separator.boundingBox())!;
  await page.mouse.move(minimum.x + 6, minimum.y + 100);
  await page.mouse.down();
  await page.mouse.move(minimum.x + 200, minimum.y + 100);
  await expect(separator).toHaveAttribute('aria-valuenow', '300');
  await page.mouse.move(minimum.x - 600, minimum.y + 100);
  await expect(separator).toHaveAttribute('aria-valuenow', '640');
  await page.mouse.up();
  await page.keyboard.press('Enter');
  await expect(separator).toHaveAttribute('aria-valuenow', '336');
  const reset = (await separator.boundingBox())!;
  await page.mouse.move(reset.x + 6, reset.y + 100);
  await page.mouse.down();
  await page.mouse.move(reset.x - 120, reset.y + 100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(separator).toHaveAttribute('aria-valuenow', '336');
  await page.getByRole('button', { name: 'Close Copilot', exact: true }).click();
  await expect(panel).toHaveCSS('width', '18px');
  await expect(separator).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Copilot', exact: true }).click();
  await separator.focus();
  await page.keyboard.press('End');
  await page.setViewportSize({ width: 900, height: 1000 });
  await expect(separator).toHaveAttribute('aria-valuemax', '372');
  await expect(panel).toHaveCSS('width', '372px');
  expect((await page.locator('.office-area').boundingBox())!.width).toBeGreaterThanOrEqual(480);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(panel).toHaveCSS('width', '640px');
  const wide = (await separator.boundingBox())!;
  await page.mouse.dblclick(wide.x + 6, wide.y + 100);
  await expect(panel).toHaveCSS('width', '336px');
  expect(errors).toEqual([]);
});

test('selects models beside the composer with icon and expanded-label layouts', async ({
  page,
}) => {
  await page.route('**/api/providers/deepseek/models', (route) =>
    route.fulfill({ json: { models: [] } }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  const picker = page.getByRole('button', { name: 'AI model', exact: true });
  await picker.click();
  await expect(page.getByRole('menu', { name: 'AI model' })).toBeVisible();
  await page.getByRole('menuitem', { name: /^(Add model|Manage models)$/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const one = await page.request.post('/api/provider-profiles', {
    data: { name: 'Quick model', provider: 'openai', model: 'fixture-quick' },
  });
  const two = await page.request.post('/api/provider-profiles', {
    data: { name: 'Deep model', provider: 'deepseek', model: 'fixture-deep' },
  });
  expect(one.ok() && two.ok()).toBe(true);
  await page.reload();
  await ready(page);
  await page.getByLabel('Message Copilot').fill('A model change must keep this draft');
  expect(await picker.locator('xpath=ancestor::form').count()).toBe(1);
  await expect(page.locator('.model-picker-label')).not.toBeVisible();
  const separator = page.getByRole('separator', { name: 'Resize Copilot panel' });
  await separator.focus();
  await page.keyboard.press('End');
  await expect(page.locator('.model-picker-label')).toBeVisible();
  await picker.click();
  const choice = page.getByRole('menuitemradio', { name: /Deep model/ });
  await choice.focus();
  await page.keyboard.press('Enter');
  await picker.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Deep model · fixture-deep · Off');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Message Copilot')).toHaveValue(
    'A model change must keep this draft',
  );
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add from workspace', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByLabel('Message Copilot')).toHaveValue(
    'A model change must keep this draft',
  );
  await picker.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(picker).toBeFocused();
  expect(await page.locator('.model-footer').count()).toBe(0);
  expect(errors).toEqual([]);
});
