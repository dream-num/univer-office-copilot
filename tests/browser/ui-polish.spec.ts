import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.save-state')).toContainText('Saved');
  await expect(page.locator('.editor-pane [data-u-comp="workbench-skeleton-content"]')).toHaveCount(
    0,
  );
}

async function choose(page: Page, name: string, option: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('keeps trackpad scrolling inside the workspace panels and dialogs', async ({ page }) => {
  await ready(page);
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const { conversations } = await (
    await page.request.get(`/api/conversations?fileId=${fileId}`)
  ).json();
  const conversation = conversations[0];
  await page.route(`**/api/conversations/${conversation.id}`, (route) =>
    route.fulfill({
      json: {
        conversation,
        messages: [
          {
            id: 'scroll-fixture-message',
            conversationId: conversation.id,
            role: 'assistant',
            text: 'Scroll fixture paragraph.\n\n'.repeat(80),
            reasoning: '',
            runId: null,
            createdAt: Date.now(),
          },
        ],
      },
    }),
  );
  await page.reload();
  await expect(page.locator('.message-markdown')).toContainText('Scroll fixture paragraph.');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(page.locator('html')).toHaveCSS('overscroll-behavior', 'none', { timeout: 1500 });
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    const chat = page.locator('.chat-viewport');
    const bounds = (await chat.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, -100000);
    await expect.poll(() => chat.evaluate((element) => element.scrollTop)).toBe(0);
    await page.mouse.wheel(0, -600);
    await page.mouse.wheel(-600, 0);
    await expect.poll(() => page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
    await expect(page.getByRole('banner')).toHaveCSS('height', '48px');
    expect((await page.getByRole('banner').boundingBox())!.y).toBe(0);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => chat.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }
  await page.setViewportSize({ width: 1440, height: 540 });
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitem', { name: /^(Add model|Manage models)$/ }).click();
  const body = page.getByRole('dialog', { name: 'Your AI models' }).locator('.modal-body');
  const bounds = (await body.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
});

test('keeps normal page scrolling on shared conversations', async ({ page }) => {
  await page.route('**/api/shared/conversations/scroll-fixture', (route) =>
    route.fulfill({
      json: {
        title: 'Shared scrolling fixture',
        messages: [{ role: 'assistant', text: 'Shared conversation text.\n'.repeat(200) }],
      },
    }),
  );
  await page.goto('/share/conversation/scroll-fixture');
  await expect(page.getByRole('heading', { name: 'Shared scrolling fixture' })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test('native file history hides Copilot and restores its previous state at every width', async ({
  page,
}) => {
  await ready(page);
  const input = page.getByLabel('Message Copilot', { exact: true });
  await expect(input).toBeEnabled();
  await input.fill('Keep this history draft');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const collapsed of [false, true]) {
      const toggle = page.getByRole('button', {
        name: collapsed ? 'Close Copilot' : 'Open Copilot',
        exact: true,
      });
      if (await toggle.isVisible()) await toggle.click();
      const panel = page.locator('.copilot-container');
      const previousWidth = (await panel.boundingBox())!.width;
      await page.getByRole('banner').getByRole('button', { name: 'History', exact: true }).click();
      const history = page.getByRole('region', { name: 'File history', exact: true });
      await expect(history).toHaveAttribute('data-open', 'true');
      await expect(panel).toBeHidden();
      await expect(input).toHaveCount(1);
      await expect(input).toHaveValue('Keep this history draft');
      const box = (await history.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await history
        .getByRole('button', { name: width < 760 ? 'Close sidebar' : 'Back', exact: true })
        .click();
      await expect(history).toHaveAttribute('data-open', 'false');
      await expect(
        page.getByRole('button', {
          name: collapsed ? 'Open Copilot' : 'Close Copilot',
          exact: true,
        }),
      ).toBeVisible();
      await expect(panel).toHaveCSS('width', `${previousWidth}px`);
      await expect(input).toHaveValue('Keep this history draft');
    }
  }
});

test('forms share the same controls and show errors inside their dialog', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitem', { name: /^(Add model|Manage models)$/ }).click();
  const settings = page.getByRole('dialog', { name: 'Your AI models' });
  await choose(page, 'Provider', 'OpenAI-compatible');
  await page.getByLabel('Model ID', { exact: true }).fill('ui-fixture');
  await page.getByLabel('API base URL', { exact: true }).fill('https://example.com/v1');
  await page.getByLabel('Configuration name', { exact: true }).fill('x'.repeat(81));
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(settings.getByRole('alert')).toBeVisible();
  await expect(
    settings.getByRole('button', { name: 'Save configuration', exact: true }),
  ).toBeEnabled();
  await settings.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Share file', exact: true }).click();
  const sharing = page.getByRole('dialog', { name: 'Share file', exact: true });
  await choose(page, 'File permission', 'Can edit');
  await sharing.getByLabel('Invite an existing account').fill('missing-person@example.test');
  await sharing.getByRole('button', { name: 'Add person', exact: true }).click();
  await expect(sharing.getByRole('alert')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const bounds = (await sharing.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(15);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
  await sharing.getByRole('button', { name: 'Close dialog' }).click();
});

test('workspace and conversation actions use cancellable application dialogs', async ({ page }) => {
  const nativeDialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await ready(page);
  await page.getByRole('button', { name: 'Expand workspace', exact: true }).click();
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Presentation', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByLabel('Folder name', { exact: true }).fill('Review materials');
  await page.getByRole('button', { name: 'Create folder', exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Workspace files' })
      .getByRole('button', { name: 'Review materials', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage Untitled spreadsheet', exact: true }).click();
  await choose(page, 'Folder', 'Review materials');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'Manage Untitled spreadsheet', exact: true }).click();
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Move file to Trash?', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Manage file', exact: true })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Manage file', exact: true })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click();
  await page.getByRole('button', { name: 'Manage New conversation', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Conversation name', { exact: true }).fill('Planning notes');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Conversation history', exact: true }),
  ).toContainText('Planning notes');
  await page.getByRole('button', { name: 'Manage Planning notes', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete conversation', exact: true }).click();
  const deleting = page.getByRole('dialog', { name: 'Delete conversation?', exact: true });
  await expect(deleting).toBeVisible();
  await deleting.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Conversation history', exact: true }),
  ).toContainText('Planning notes');
  expect(nativeDialogs).toEqual([]);
});
