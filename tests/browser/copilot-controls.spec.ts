import { test, expect, type Page, type Locator } from '@playwright/test';

async function tabTo(page: Page, target: Locator, key = 'Tab') {
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press(key);
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('The control could not be reached by keyboard.');
}
async function withoutModels(page: Page) {
  await page.route('**/api/provider-profiles', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { profiles: [] } })
      : route.continue(),
  );
}
async function chooseMode(page: Page, name: 'Ask' | 'Edit') {
  await page.getByRole('button', { name: 'Copilot mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}

test('dialog autofocus and pointer focus restoration stay quiet while hover and Tab hints work', async ({
  page,
}) => {
  await withoutModels(page);
  await page.goto('/');
  await expect(page.locator('.save-state')).toContainText('Saved');
  await expect(page.getByLabel('Message Copilot', { exact: true })).toBeEnabled();
  const tips = page.getByRole('tooltip');
  const close = page.getByRole('button', { name: 'Close dialog', exact: true });
  await page.getByRole('button', { name: 'Export file', exact: true }).click();
  const exporting = page.getByRole('dialog', { name: 'Export file', exact: true });
  await expect(exporting).toBeVisible();
  // Wait past the shared hover delay to catch accidental delayed opens too.
  await page.waitForTimeout(500);
  await expect(tips).toHaveCount(0, { timeout: 1000 });
  await expect(exporting).toBeFocused();
  await close.hover();
  await expect(tips).toHaveText('Close dialog');
  await page.mouse.move(0, 0, { steps: 10 });
  await expect(tips).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await expect(tips).toHaveText('Close dialog');
  await page.keyboard.press('Escape');
  await expect(tips).toHaveCount(0);
  await expect(exporting).toBeVisible();
  await close.click();
  await expect(exporting).toBeHidden();
  await page.getByRole('button', { name: 'Export file', exact: true }).press('Enter');
  await expect(exporting).toBeFocused();
  await page.waitForTimeout(500);
  await expect(tips).toHaveCount(0);
  await close.click();
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add model', exact: true }).click();
  const models = page.getByRole('dialog', { name: 'Your AI models', exact: true });
  await expect(models).toBeFocused();
  await page.waitForTimeout(500);
  await expect(tips).toHaveCount(0);
  await close.click();
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'AI model', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(tips).toHaveText('Add files from your device or workspace');
  await page.keyboard.press('Escape');
  await page.getByLabel('Message Copilot', { exact: true }).click();
  await expect(tips).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Manage Untitled spreadsheet', exact: true }).click();
  const managing = page.getByRole('dialog', { name: 'Manage file', exact: true });
  await expect(managing).toBeFocused();
  await expect(tips).toHaveCount(0);
  await page.getByRole('button', { name: 'Change file icon', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Type to search for an emoji', exact: true })
    .fill('rocket');
  await page.getByRole('gridcell', { name: 'rocket', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Choose file icon', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Change file icon', exact: true })).toBeFocused();
  await page.waitForTimeout(500);
  await expect(tips).toHaveCount(0);
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Move file to Trash?', exact: true });
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await managing.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Folder name', exact: true })).toBeFocused();
  await expect(tips).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Search conversations', exact: true }),
  ).toBeFocused();
  await expect(tips).toHaveCount(0);
});

test('empty Copilot offers product examples and keeps model setup inside chat', async ({
  page,
}) => {
  await withoutModels(page);
  let sent = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent/runs')) sent++;
  });
  await page.goto('/');
  await expect(page.locator('.save-state')).toContainText('Saved');
  const input = page.getByLabel('Message Copilot', { exact: true });
  await expect(input).toBeEnabled();
  const header = page.getByRole('banner');
  await expect(header.getByRole('button', { name: 'Model settings' })).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a model', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your AI models', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  for (const [product, example] of [
    [null, 'Create a monthly budget'],
    ['Modern document', 'Draft a project brief'],
    ['Paged document', 'Draft a project brief'],
    ['Presentation', 'Create a three-slide pitch'],
    ['Relational table', 'Build a project tracker'],
    ['Canvas', 'Map a simple workflow'],
  ] as const) {
    if (product) {
      await page.getByRole('button', { name: 'New file', exact: true }).click();
      await page.getByRole('menuitem', { name: product, exact: true }).click();
      await expect(page.locator('.save-state')).toContainText('Saved');
    }
    await expect(input).toBeEnabled();
    await expect(page.locator('.welcome-example')).toHaveCount(2);
    if (!product) await page.screenshot({ path: 'output/welcome-app.png' });
    await page.getByRole('button', { name: example, exact: true }).click();
    await expect(input).not.toHaveValue('');
    await expect(input).toBeFocused();
    await expect(page.getByRole('button', { name: 'Copilot mode', exact: true })).toHaveText(
      'Edit',
    );
    await expect(page.locator('.copilot-welcome')).toHaveCount(0);
    await input.fill('My own draft');
    await expect(page.locator('.copilot-welcome')).toHaveCount(0);
    await input.fill('');
    await expect(page.getByRole('button', { name: example, exact: true })).toBeVisible();
  }
  expect(sent).toBe(0);
});

test('compact Copilot controls explain actions on hover and keyboard focus', async ({ page }) => {
  await withoutModels(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.save-state')).toContainText('Saved');
  await expect(page.getByLabel('Message Copilot')).toBeEnabled();
  const panel = page.getByRole('complementary', { name: 'Copilot', exact: true });
  await expect(
    panel.getByRole('heading', { name: 'Start something useful', exact: true }),
  ).toBeVisible();
  await expect(panel.locator('.target-chip')).toHaveCount(0);
  await expect(panel).not.toContainText('Untitled spreadsheet');
  await page.getByLabel('Message Copilot').fill('Keep this draft');

  const mode = panel.getByRole('button', { name: 'Copilot mode', exact: true });
  await expect(
    panel.locator('.copilot-header').getByRole('button', { name: 'Copilot mode' }),
  ).toHaveCount(0);
  await expect(
    panel.locator('.composer').getByRole('button', { name: 'Copilot mode' }),
  ).toBeVisible();
  await mode.click();
  await expect(page.getByRole('menuitemradio', { name: 'Ask', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(mode).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText('Ask questions without changing the file');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(mode).toHaveText('Ask');
  await mode.press('Enter');
  await expect(page.getByRole('menuitemradio', { name: 'Ask', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('menuitemradio', { name: 'Edit', exact: true }).click();
  await expect(mode).toHaveText('Edit');
  await chooseMode(page, 'Ask');
  await expect(page.getByLabel('Message Copilot')).toHaveValue('Keep this draft');

  const attach = panel.getByRole('button', { name: 'Attach files', exact: true });
  await attach.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Add files from your device or workspace');
  await expect(attach).toHaveText('');
  await attach.click();
  await page.getByRole('menuitem', { name: 'Add from workspace', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Attach workspace files' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  const selection = panel.getByRole('button', { name: 'Use selection', exact: true });
  await page.getByLabel('Message Copilot').click();
  await tabTo(page, selection);
  await expect(page.getByRole('tooltip')).toHaveText('Use selected cells as context');
  await selection.click();
  const remove = panel.getByRole('button', { name: /^Remove selected context:/ });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);

  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitem', { name: /^(Add model|Manage models)$/ }).click();
  const settings = page.getByRole('dialog', { name: 'Your AI models' });
  await tabTo(page, settings.getByRole('button', { name: 'How API keys are used' }));
  await expect(page.getByRole('tooltip')).toContainText(
    'Keys entered here stay in this page until reload.',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(settings).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByLabel('Message Copilot')).toHaveValue('Keep this draft');

  await page.setViewportSize({ width: 390, height: 844 });
  const header = (await panel.locator('.copilot-header').boundingBox())!;
  const bounds = (await panel.boundingBox())!;
  for (const button of await panel.locator('.copilot-header button').all()) {
    const rect = (await button.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  }
  expect(header.height).toBeLessThanOrEqual(54);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await mode.click();
  const modeMenu = (await page.getByRole('menu').boundingBox())!;
  expect(modeMenu.x).toBeGreaterThanOrEqual(12);
  expect(modeMenu.x + modeMenu.width).toBeLessThanOrEqual(378);
  await page.keyboard.press('Escape');
  await expect(mode).toBeFocused();
  expect(errors).toEqual([]);
});

test('composer actions share a bottom row while the input grows, caps and shrinks upward', async ({
  page,
}) => {
  const errors: string[] = [];
  const submissions: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent/runs'))
      submissions.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.save-state')).toContainText('Saved');
  const input = page.getByLabel('Message Copilot');
  await expect(input).toBeEnabled();
  const composer = page.locator('.composer');
  const initialInput = (await input.boundingBox())!;
  const initialComposer = (await composer.boundingBox())!;
  const bottom = initialComposer.y + initialComposer.height;
  const alignActions = async () => {
    const footer = (await page.locator('.composer-footer').boundingBox())!;
    const inputBounds = (await input.boundingBox())!;
    expect(footer.y).toBeGreaterThanOrEqual(inputBounds.y + inputBounds.height + 8);
    const controls = ['Copilot mode', 'AI model', 'Attach files', 'Use selection', 'Send message'];
    let previousRight = 0;
    for (const name of controls) {
      const button = page.getByRole('button', { name, exact: true });
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(previousRight);
      expect(Math.abs(bounds.y + bounds.height / 2 - (footer.y + footer.height / 2))).toBeLessThan(
        1,
      );
      previousRight = bounds.x + bounds.width;
    }
    expect(previousRight).toBeLessThanOrEqual(footer.x + footer.width + 1);
  };
  await alignActions();
  await input.fill(Array.from({ length: 6 }, (_, index) => `Line ${index + 1}`).join('\n'));
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeGreaterThan(initialInput.height + 60);
  const grownComposer = (await composer.boundingBox())!;
  expect(grownComposer.y).toBeLessThan(initialComposer.y - 60);
  expect(Math.abs(grownComposer.y + grownComposer.height - bottom)).toBeLessThan(1);
  await alignActions();

  const longText = Array.from({ length: 50 }, (_, index) => `Pasted line ${index + 1}`).join('\n');
  await input.fill(longText);
  await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(240);
  expect(await input.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(input).toHaveCSS('overflow-y', 'auto');
  await input.press('ControlOrMeta+End');
  expect(await input.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await alignActions();
  await input.clear();
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeCloseTo(initialInput.height, 0);

  const separator = page.getByRole('separator', { name: 'Resize Copilot panel' });
  await separator.focus();
  await page.keyboard.press('End');
  await input.fill(
    'Explain the quarterly forecast and highlight unusual revenue trends. '.repeat(5),
  );
  const wideHeight = (await input.boundingBox())!.height;
  await separator.focus();
  await page.keyboard.press('Home');
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeGreaterThan(wideHeight + 20);
  await alignActions();

  await page.setViewportSize({ width: 390, height: 460 });
  await input.fill(longText);
  await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(139);
  await alignActions();
  const mobileComposer = (await composer.boundingBox())!;
  expect(mobileComposer.y).toBeGreaterThan(98);
  expect(mobileComposer.y + mobileComposer.height).toBeLessThanOrEqual(446);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await input.fill('First line');
  await input.press('Shift+Enter');
  await input.pressSequentially('Second line');
  await expect(input).toHaveValue('First line\nSecond line');
  expect(submissions).toEqual([]);
  expect(errors).toEqual([]);
});
