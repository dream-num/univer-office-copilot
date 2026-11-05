import { test, expect, type Page } from '@playwright/test';
import type { OfficeFile } from '../../shared/src/index.ts';
import type { VersionSnapshot } from '../../web/src/features/editor/index.ts';

async function ready(page: Page) {
  await expect(page.getByRole('status', { name: 'Synced', exact: true })).toBeVisible();
  await expect(page.getByLabel('Message Copilot', { exact: true })).toBeEnabled();
}

async function editCell(page: Page, value: string) {
  const boxes = await page.locator('.editor-pane canvas').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, height: box.height };
    }),
  );
  const grid = boxes.find((box) => box.height > 300)!;
  await page.mouse.click(grid.x + 85, grid.y + 35);
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}

async function openRecordedTurn(page: Page, fileId: string, revision: number) {
  const { conversations } = await (
    await page.request.get(`/api/conversations?fileId=${fileId}`)
  ).json();
  const conversation = conversations[0];
  const run = {
    id: 'turn-changes-fixture',
    conversationId: conversation.id,
    fileId,
    status: 'completed',
    createdAt: Date.now(),
    error: null,
  };
  await page.route(`**/api/conversations/${conversation.id}`, (route) =>
    route.fulfill({
      json: {
        conversation,
        messages: [
          {
            id: 'turn-answer',
            conversationId: conversation.id,
            role: 'assistant',
            text: 'Updated the sales forecast.',
            reasoning: '',
            runId: run.id,
            createdAt: run.createdAt,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/conversations/${conversation.id}/runs`, (route) =>
    route.fulfill({ json: { runs: [run] } }),
  );
  await page.route(`**/api/conversations/${conversation.id}/runs/${run.id}/changes`, (route) =>
    route.fulfill({
      json: {
        changes: [
          {
            id: 'turn-change',
            runId: run.id,
            fileId,
            operationId: 'turn-operation',
            revision,
            changesetId: `fixture:${revision}`,
            summary: 'Updated sales forecast',
            location: null,
            checked: true,
          },
        ],
      },
    }),
  );
  await page.reload();
  await ready(page);
  await page.getByLabel('Message Copilot', { exact: true }).fill('Keep this draft');
  await page.getByRole('button', { name: 'View changes', exact: true }).click();
}

test('turn changes show native before/after values and restore a real file without losing the chat', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const versions = async () =>
    (await (await page.request.get(`/api/files/${fileId}/versions`)).json()).versions as {
      revision: number;
      source: string;
    }[];
  await editCell(page, 'Turn result');
  await expect.poll(async () => (await versions())[0]!.revision).toBeGreaterThan(1);
  const revision = (await versions())[0]!.revision;
  await openRecordedTurn(page, fileId, revision);
  const changes = page.getByRole('dialog', { name: 'This turn’s modifications', exact: true });
  await changes
    .getByRole('button', { name: `View changes in revision ${revision}`, exact: true })
    .click();
  await expect(changes).toContainText('Turn result');
  await expect(changes).toContainText('Sheet1 · A1');
  await expect(changes.getByText('Before', { exact: true }).first()).toBeVisible();
  await expect(changes.getByText('After', { exact: true }).first()).toBeVisible();
  expect((await versions())[0]!.revision).toBe(revision);
  await changes.getByRole('button', { name: 'Restore before this turn', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Restore file?', exact: true });
  await expect(confirmation).toContainText('whole file');
  await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await versions())[0]!.revision).toBe(revision);
  await changes.getByRole('button', { name: 'Restore before this turn', exact: true }).click();
  // Another live editor changes the file after the confirmation has checked its head.
  const concurrent = await page.context().newPage();
  await concurrent.goto(`/?file=${fileId}`);
  await ready(concurrent);
  await editCell(concurrent, 'Later edit');
  await expect.poll(async () => (await versions())[0]!.revision).toBe(revision + 1);
  await concurrent.close();
  await confirmation.getByRole('button', { name: 'Restore file', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toContainText('The file changed');
  expect((await versions())[0]!.revision).toBe(revision + 1);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await changes
    .getByRole('button', { name: `Restore before revision ${revision}`, exact: true })
    .click();
  await confirmation.getByRole('button', { name: 'Restore file', exact: true }).click();
  await expect.poll(async () => (await versions())[0]!.revision).toBe(revision + 2);
  expect((await versions())[0]!.source).toBe('restore');
  await expect(changes.getByRole('status')).toContainText('File restored');
  await changes.getByRole('button', { name: 'Done', exact: true }).click();
  await ready(page);
  await expect(page.getByLabel('Message Copilot', { exact: true })).toHaveValue('Keep this draft');
  await expect(page.getByText('Updated the sales forecast.', { exact: true })).toBeVisible();
  const snapshot = await (
    await page.request.get(`/api/files/${fileId}/versions/${revision + 2}`)
  ).json();
  expect(snapshot.content.data).toBeDefined();
  expect(JSON.stringify(snapshot.content.data)).not.toContain('Turn result');
});

test('all product comparisons support retry, product labels and paged details without a model request', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  let modelRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent/runs')) modelRequests++;
  });
  for (const [type, documentFlavor] of [
    ['sheet', undefined],
    ['doc', 'modern'],
    ['doc', 'traditional'],
    ['slide', undefined],
    ['base', undefined],
    ['board', undefined],
  ] as const) {
    const { file } = (await (
      await page.request.post('/api/files', {
        data: { type, documentFlavor, name: `Comparison ${type}` },
      })
    ).json()) as { file: OfficeFile };
    await page.goto(`/?file=${file.id}`);
    await ready(page);
    const { content: before } = (await (
      await page.request.get(`/api/files/${file.id}/versions/1`)
    ).json()) as { content: VersionSnapshot };
    const after = structuredClone(before);
    after.revision = 2;
    if (type === 'sheet') {
      const sheets = after.data.sheets as Record<string, { cellData: Record<string, unknown> }>;
      const first = Object.values(sheets)[0]!;
      for (let row = 0; row < 55; row++)
        first.cellData[row] = { 0: { v: `Comparison sample ${row + 1}`, t: 1 } };
    } else if (type === 'doc') {
      const body = after.data.body as { dataStream: string; paragraphs: { startIndex: number }[] };
      body.dataStream = 'Comparison sample\r\n';
      body.paragraphs = [{ ...body.paragraphs[0], startIndex: 'Comparison sample'.length }];
    } else {
      const collection = after.data[
        type === 'slide' ? 'slides' : type === 'base' ? 'tables' : 'pages'
      ] as Record<string, { name: string }>;
      Object.values(collection)[0]!.name = 'Comparison sample';
      // Native Board snapshots keep the legacy Slide aliases synchronized.
      if (type === 'board') after.data.slides = structuredClone(after.data.pages);
    }
    let failOnce = type === 'sheet';
    await page.route(`**/api/files/${file.id}/versions/2`, (route) => {
      if (failOnce) {
        failOnce = false;
        return route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'History temporarily unavailable.' } },
        });
      }
      return route.fulfill({ json: { content: after } });
    });
    await openRecordedTurn(page, file.id, 2);
    const changes = page.getByRole('dialog', { name: 'This turn’s modifications', exact: true });
    await changes.getByRole('button', { name: 'View changes in revision 2', exact: true }).click();
    if (type === 'sheet') {
      await expect(changes.getByRole('alert')).toContainText('History temporarily unavailable.');
      await changes.getByRole('button', { name: 'Try again', exact: true }).click();
    }
    await expect(changes).toContainText('Comparison sample');
    await expect(changes.getByText('Before', { exact: true }).first()).toBeVisible();
    await expect(changes.getByText('After', { exact: true }).first()).toBeVisible();
    if (type === 'sheet') {
      await expect(changes.getByText('Sheet1 · A55', { exact: true })).toHaveCount(0);
      await changes.getByRole('button', { name: 'Show more changes', exact: true }).click();
      await expect(changes.getByText('Sheet1 · A55', { exact: true })).toBeVisible();
      await expect(
        changes.getByRole('button', { name: 'Show more changes', exact: true }),
      ).toHaveCount(0);
      const body = (await changes.locator('.modal-body').boundingBox())!;
      const footer = (await changes.locator('.modal-footer').boundingBox())!;
      expect(body.y + body.height).toBeLessThanOrEqual(footer.y + 1);
      await expect(
        changes.getByRole('button', { name: 'Restore before this turn', exact: true }),
      ).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      const small = (await changes.boundingBox())!;
      expect(small.x).toBeGreaterThanOrEqual(16);
      expect(small.x + small.width).toBeLessThanOrEqual(374);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      await page.setViewportSize({ width: 1600, height: 1000 });
    }
    await changes.getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
  expect(modelRequests).toBe(0);
});
