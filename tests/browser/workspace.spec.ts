import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.locator('.save-state')).toContainText('Saved');
  await expect(page.locator('.editor-pane').getByRole('button').first()).toBeVisible();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.editor-pane canvas')].some(
      (canvas) => canvas.getBoundingClientRect().height > 300,
    ),
  );
  await expect(page.locator('.editor-error')).toHaveCount(0);
  await expect(page.locator('[data-u-comp="workbench-skeleton-content"]')).toHaveCount(0);
}

async function expectRibbon(page: Page, commands: string[]) {
  const editor = page.locator('.editor-pane');
  await expect(editor.locator('[data-u-comp="ribbon-grid-toolbar"]')).toBeVisible();
  await editor
    .locator('[data-u-comp="ribbon-header-menu"]')
    .getByText('Insert', { exact: true })
    .click();
  for (const command of commands)
    await expect(editor.locator(`[data-u-command="${command}"]`)).toBeVisible();
}

test('opens all five real editors and keeps API keys out of persistent browser storage', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  await expectRibbon(page, [
    'sheet.command.menu-insert-chart',
    'data-validation.command.insert-quick-rule',
    'sheet.operation.show-comment-modal',
  ]);
  const runtimeConfigured = !!(await (await page.request.get('/api/config')).json()).clientLicense;
  for (const product of [
    'Modern document',
    'Paged document',
    'Presentation',
    'Relational table',
    'Canvas',
  ]) {
    await page.getByRole('button', { name: 'New file', exact: true }).click();
    await page.getByRole('menuitem', { name: product, exact: true }).click();
    await expect(page.locator('.file-title strong')).toHaveText(
      product === 'Modern document' ? 'Untitled document' : `Untitled ${product.toLowerCase()}`,
    );
    await ready(page);
    if (product.endsWith('document')) {
      const fileId = new URL(page.url()).searchParams.get('file');
      const { file } = await (await page.request.get(`/api/files/${fileId}`)).json();
      expect(file.documentFlavor).toBe(product === 'Paged document' ? 'traditional' : 'modern');
      await expectRibbon(page, [
        'doc.menu.table',
        'docs-code.command.insert',
        'docs-latex.operation.open-formula-popup',
      ]);
    }
    if (product === 'Presentation') {
      await expectRibbon(page, [
        'slide.operation.insert.open-chart-dialog',
        'slide.menu.insert.table',
      ]);
      await expect(
        page.locator('.editor-pane').getByRole('textbox', { name: 'Zoom', exact: true }),
      ).toBeVisible();
    }
    if (product === 'Relational table') {
      await expect(page.locator('[data-u-comp="base-header"]')).toBeVisible();
      await expect(
        page.locator('.editor-pane').getByRole('button', { name: 'Filter', exact: true }),
      ).toBeVisible();
    }
    if (product === 'Relational table' || product === 'Canvas')
      await expect(page.locator('.editor-pane [data-u-comp="ribbon-header-menu"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    const history = page.getByRole('region', { name: 'File history', exact: true });
    await expect(history).toHaveAttribute('data-open', 'true');
    await expect(history.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    await expect(history.getByText('Demo user', { exact: true }).first()).toBeVisible();
    await history.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(history).toHaveAttribute('data-open', 'false');
    if (runtimeConfigured)
      await expect(page.getByText('Univer Office License Required', { exact: false })).toHaveCount(
        0,
      );
  }
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitem', { name: /^(Add model|Manage models)$/ }).click();
  await page.getByRole('combobox', { name: 'Provider', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(6);
  await page.getByRole('option', { name: 'DeepSeek', exact: true }).click();
  await page.getByLabel('Configuration name', { exact: true }).fill('Browser test model');
  await page.getByLabel('Model ID', { exact: true }).fill('deepseek-chat');
  const key = 'browser-test-key-not-a-real-key';
  await page.getByLabel('API key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Configuration saved');
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain(key);
  expect(
    JSON.stringify(await (await page.request.get('/api/provider-profiles')).json()),
  ).not.toContain(key);
  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitem', { name: /^(Add model|Manage models)$/ }).click();
  await page.getByRole('combobox', { name: 'Configuration', exact: true }).click();
  await page.getByRole('option', { name: 'Browser test model', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  expect(errors).toEqual([]);
});

test('restores an open document, survives the ACK, and can recover its later version', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Modern document', exact: true }).click();
  await ready(page);
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const box = (await page.locator('.editor-pane').boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 210);
  await page.keyboard.insertText('Restore checkpoint');
  await expect(page.locator('.editor-pane')).toContainText('2 words');
  const versions = async () =>
    (await (await page.request.get(`/api/files/${fileId}/versions`)).json()).versions as {
      revision: number;
      source: string;
    }[];
  await expect.poll(async () => (await versions())[0]!.revision).toBeGreaterThan(1);
  const editedRevision = (await versions())[0]!.revision;
  const viewer = page.getByRole('region', { name: 'File history', exact: true });
  const rows = viewer.locator('[class*="univer-min-h-[3.75rem]"]');
  await page.getByLabel('Message Copilot', { exact: true }).fill('Keep this draft');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(viewer.getByText('Demo user', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('Message Copilot', { exact: true })).toBeDisabled();
  await rows.last().click();
  await expect(viewer).toContainText('0 words');
  expect((await versions())[0]!.revision).toBe(editedRevision);
  await viewer.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Message Copilot', { exact: true })).toHaveValue('Keep this draft');
  await expect(page.getByLabel('Message Copilot', { exact: true })).toBeEnabled();
  await expect(page.locator('.editor-pane')).toContainText('2 words');
  async function restore(row: number, expectedRevision: number, words: number) {
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(rows).toHaveCount(expectedRevision);
    await rows.nth(row).click();
    await viewer.getByRole('button', { name: 'Restore this version', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toContainText('whole shared file');
    await confirmation.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect.poll(async () => (await versions())[0]!.revision).toBe(expectedRevision + 1);
    expect((await versions())[0]!.source).toBe('restore');
    await expect(viewer).toHaveAttribute('data-open', 'false');
    expect((await page.request.get('/health')).ok()).toBe(true);
    await page.reload();
    await ready(page);
    await expect(page.locator('.editor-pane')).toContainText(`${words} words`);
  }
  await restore(1, editedRevision, 0);
  await restore(1, editedRevision + 1, 2);
});

test('synchronizes a native spreadsheet edit between independent users and opens a read-only file link', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/');
  await ready(page);
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const file = (await (await page.request.get(`/api/files/${fileId}`)).json()).file;
  const editorContext = await browser.newContext({
    baseURL,
    viewport: { width: 1600, height: 1000 },
  });
  const editor = (await (await editorContext.request.post('/api/auth/demo')).json()).user;
  const grant = await page.request.post(`/api/files/${fileId}/permissions`, {
    data: { email: editor.email, role: 'editor' },
  });
  expect(grant.status()).toBe(204);
  await page.reload();
  await ready(page);
  const other = await editorContext.newPage();
  const received: string[] = [];
  other.on('websocket', (socket) =>
    socket.on('framereceived', (frame) => received.push(String(frame.payload))),
  );
  await other.goto(`/?file=${fileId}`);
  await ready(other);
  await expect(page.locator('.members')).toContainText('2 online');
  const canvas = page.locator('canvas').filter({ visible: true });
  const boxes = await canvas.evaluateAll((values) =>
    values.map((value) => {
      const box = value.getBoundingClientRect();
      return { x: box.x, y: box.y, height: box.height };
    }),
  );
  const grid = boxes.find((value) => value.height > 300)!;
  const text = `Collaborative-${Date.now()}`;
  await page.mouse.click(grid.x + 85, grid.y + 35);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect.poll(() => received.some((frame) => frame.includes(text))).toBe(true);
  await expect(page.locator('.save-state')).toContainText('Saved');
  const persisted = await (
    await other.request.get(`/universer-api/snapshot/2/unit/${file.unitId}/rev/0`)
  ).json();
  expect(JSON.stringify(persisted)).toContain(text);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const history = page.getByRole('region', { name: 'File history', exact: true });
  await expect(history).toHaveAttribute('data-open', 'true');
  await expect(history.getByText('Current Version', { exact: true })).toBeVisible();
  await expect(history.getByText('Cells edited', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(history).toHaveAttribute('data-open', 'false');
  await ready(page);
  await other.getByRole('button', { name: 'History', exact: true }).click();
  const editorHistory = other.getByRole('region', { name: 'File history', exact: true });
  await expect(editorHistory).toHaveAttribute('data-open', 'true');
  await expect(
    editorHistory.getByRole('button', { name: 'Restore this version', exact: true }),
  ).toBeDisabled();
  await editorHistory.getByRole('button', { name: 'Back', exact: true }).click();
  const link = await (
    await page.request.post(`/api/files/${fileId}/share-links`, { data: { hours: 1 } })
  ).json();
  await editorContext.close();
  const guestContext = await browser.newContext({
    baseURL,
    viewport: { width: 1600, height: 1000 },
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/share/file/${link.token}`);
  await ready(guest);
  await expect(guest.getByRole('button', { name: 'Share file', exact: true })).toBeDisabled();
  const head = await (
    await guest.request.get(`/universer-api/snapshot/2/unit/${file.unitId}/rev/0`)
  ).json();
  expect(head.changesets).toEqual([]);
  const past = await (
    await guest.request.get(`/universer-api/snapshot/2/unit/${file.unitId}/rev/1`)
  ).json();
  expect(past.error.code).not.toBe(1);
  const missing = await (
    await guest.request.get(
      `/universer-api/snapshot/2/unit/${file.unitId}/fetchmissing?from=1&to=2`,
    )
  ).json();
  expect(missing.error.code).not.toBe(1);
  await page.request.delete(`/api/files/${fileId}/share-links/${link.id}`);
  expect((await guest.request.get(`/api/shared/files/${link.token}`)).status()).toBe(404);
  await guestContext.close();
});

test('renders streamed answers and collapsible public reasoning through the chat adapter', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await expect(page.getByLabel('Message Copilot')).toBeEnabled();
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const { conversations } = await (
    await page.request.get(`/api/conversations?fileId=${fileId}`)
  ).json();
  const conversationId = conversations[0].id,
    now = Date.now();
  const { profile } = await (
    await page.request.post('/api/provider-profiles', {
      data: { name: 'UI fixture', provider: 'openai', model: 'fixture' },
    })
  ).json();
  await page.request.post('/api/provider-profiles', {
    data: { name: 'Other model', provider: 'deepseek', model: 'unused-fixture' },
  });
  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitem', { name: /^(Add model|Manage models)$/ }).click();
  await page.getByRole('combobox', { name: 'Configuration', exact: true }).click();
  await page.getByRole('option', { name: 'UI fixture', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('ui-fixture-key');
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /UI fixture/ }).click();
  const address = page.locator('.editor-pane [data-u-comp="defined-name"] input');
  await address.fill('B2:D5');
  await address.press('Enter');
  await page.getByRole('button', { name: 'Use selection', exact: true }).click();
  const pinned = page.getByRole('button', { name: 'Remove selected context: Sheet1!B2:D5' });
  await expect(pinned).toBeVisible();
  await address.fill('F10:G12');
  await address.press('Enter');
  await expect(address).toHaveValue('F10:G12');
  const run = {
    id: 'ui-fixture-run',
    conversationId,
    fileId,
    status: 'running',
    createdAt: now,
    error: null,
  };
  const remoteImages: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://untrusted-image.invalid/'))
      remoteImages.push(request.url());
  });
  const answer =
    '**Fixture answer**\n\n- Saved content\n\n`SUM(A1:A3)`\n\n![blocked image](https://untrusted-image.invalid/tracker.png)\n\n| Check | Result |\n| --- | --- |\n| Saved | Yes |';
  const publicReasoning = 'Public reasoning fixture\n'.repeat(80);
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const messages = [
    {
      id: 'ui-user',
      conversationId,
      role: 'user',
      text: 'Read this file',
      reasoning: '',
      runId: run.id,
      createdAt: now,
    },
    {
      id: 'ui-assistant',
      conversationId,
      role: 'assistant',
      text: answer,
      reasoning: publicReasoning,
      runId: run.id,
      createdAt: now + 1,
    },
  ];
  // This test isolates chat rendering/transport. Actual LangChain tools and SDK writes
  // are exercised separately by the server integration suite, without paid API calls.
  await page.route(`**/api/conversations/${conversationId}`, (route) =>
    route.fulfill({ json: { conversation: conversations[0], messages } }),
  );
  await page.route('**/api/agent/runs', async (route) => {
    const request = route.request().postDataJSON();
    expect(request.mode).toBe('ask');
    expect(request.apiKey).toBe('ui-fixture-key');
    expect(request.profileId).toBe(profile.id);
    expect(request.fileId).toBe(fileId);
    expect(request.selection).toEqual({ sheetId: expect.any(String), range: 'B2:D5' });
    expect(request.selection.sheetId).not.toBe('');
    await responseGate;
    const events = [
      { seq: 1, type: 'run.started', data: {} },
      { seq: 2, type: 'reasoning.delta', data: { text: publicReasoning } },
      { seq: 3, type: 'text.delta', data: { text: answer } },
      { seq: 4, type: 'run.completed', data: {} },
    ].map((event) => ({ event: { ...event, runId: run.id, at: now } }));
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [JSON.stringify({ run }), ...events.map((event) => JSON.stringify(event))].join('\n') +
        '\n',
    });
  });
  await page.getByLabel('Message Copilot').fill('Read this file');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.chat-activity')).toContainText('Waiting for response…');
  await expect(page.getByRole('button', { name: 'Stop Copilot' })).toBeVisible();
  releaseResponse();
  await expect(page.getByText('Fixture answer', { exact: true })).toBeVisible();
  await expect(page.locator('.message-markdown strong')).toHaveText('Fixture answer');
  await expect(page.locator('.message-markdown table')).toContainText('Saved');
  await expect(page.locator('.message-markdown code')).toHaveText('SUM(A1:A3)');
  await expect(page.locator('.message-markdown img')).toHaveCount(0);
  expect(remoteImages).toEqual([]);
  await expect(page.locator('.reasoning')).not.toHaveAttribute('open');
  await page.locator('.reasoning summary').click();
  await expect(page.locator('.reasoning .message-text')).toContainText('Public reasoning fixture');
  await expect(page.locator('.reasoning .message-text')).toHaveCSS('overflow-y', 'auto');
  expect(
    await page
      .locator('.reasoning .message-text')
      .evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  await expect(page.locator('.chat-activity')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View changes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  await pinned.click();
  await page.getByRole('button', { name: 'Use selection', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove selected context: Sheet1!F10:G12' }),
  ).toBeVisible();
  await page.route(`**/api/conversations/${conversationId}/runs/${run.id}/changes`, (route) =>
    route.fulfill({
      json: {
        changes: [
          {
            id: 'fixture-change',
            runId: run.id,
            fileId,
            operationId: 'fixture-operation',
            revision: 1,
            changesetId: 'fixture:1',
            summary: 'Fixture saved cells',
            checked: true,
            location: null,
          },
        ],
      },
    }),
  );
  await page.getByRole('button', { name: 'View changes', exact: true }).click();
  const changes = page.getByRole('dialog', { name: 'This turn’s modifications', exact: true });
  await expect(changes).toContainText('Revision 1');
  await expect(changes).toContainText('whole file');
  await changes.getByRole('button', { name: 'Open file history', exact: true }).click();
  const history = page.getByRole('region', { name: 'File history', exact: true });
  await expect(history).toHaveAttribute('data-open', 'true');
  await expect(changes).toHaveCount(0);
  await history.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByText('Fixture answer', { exact: true })).toBeVisible();
});

test('persists Ribbon comments and inline images in the shared file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const { file } = await (await page.request.get(`/api/files/${fileId}`)).json();
  const snapshot = async () =>
    JSON.stringify(
      await (await page.request.get(`/universer-api/snapshot/2/unit/${file.unitId}/rev/0`)).json(),
    );
  await expectRibbon(page, ['sheet.operation.show-comment-modal']);
  await page.locator('[data-u-command="sheet.operation.show-comment-modal"]').click();
  await page.locator('[contenteditable="true"]').last().focus();
  const comment = `Persisted Ribbon comment ${Date.now()}`;
  await page.keyboard.type(comment);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect.poll(snapshot).toContain(comment);
  await page.reload();
  await ready(page);
  await expectRibbon(page, ['sheet.operation.toggle-comment-panel']);
  await page.locator('[data-u-command="sheet.operation.toggle-comment-panel"]').click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page.locator('[data-u-command="sheet.menu.image"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Float Image', { exact: true }).click();
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  await (
    await chooser
  ).setFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect.poll(snapshot).toContain(`data:image/png;base64,${png}`);
  await page.reload();
  await ready(page);
  expect(await snapshot()).toContain(comment);
  expect(await snapshot()).toContain(png);
  expect(errors).toEqual([]);
});
