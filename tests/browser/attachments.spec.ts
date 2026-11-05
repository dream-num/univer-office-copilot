import { test, expect, type Page } from '@playwright/test';
import { attachmentPdf, attachmentPng } from '../fixtures/chat-files.ts';
import type { ChatAttachment } from '../../shared/src/contracts.ts';

async function ready(page: Page, noModels = true) {
  if (noModels)
    await page.route('**/api/provider-profiles', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { profiles: [] } })
        : route.continue(),
    );
  await page.route('**/api/providers/deepseek/models', (route) =>
    route.fulfill({ json: { models: [] } }),
  );
  await page.goto('/');
  await expect(page.locator('.save-state')).toContainText('Saved');
  await expect(page.getByLabel('Message Copilot', { exact: true })).toBeEnabled();
}
const input = (page: Page) => page.getByLabel('Upload local files', { exact: true });
const cards = (page: Page) => page.locator('.composer .attachment-card');
const file = (name: string, buffer: Buffer, mimeType = 'text/plain') => ({
  name,
  buffer,
  mimeType,
});

test('uploads real local documents and images, previews them, and imports a dropped CSV without replacing the current file', async ({
  page,
}) => {
  await ready(page);
  const fileId = new URL(page.url()).searchParams.get('file');
  await page.getByLabel('Message Copilot').fill('Keep this draft while files upload');
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Upload files', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await input(page).setInputFiles([
    file('brief.md', Buffer.from('# Brief\n\nRevenue target: 128')),
    file('report.pdf', attachmentPdf(), 'application/pdf'),
    file('chart.png', attachmentPng, 'image/png'),
    file('notes.txt', Buffer.from('Reference notes.')),
  ]);
  await expect(cards(page)).toHaveCount(4);
  for (const name of ['brief.md', 'report.pdf', 'chart.png', 'notes.txt'])
    await expect(page.getByRole('button', { name: `Preview ${name}`, exact: true })).toBeEnabled();
  await expect(page.getByLabel('Message Copilot')).toHaveValue(
    'Keep this draft while files upload',
  );
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await expect(page.locator('.attachment-note[role="status"]')).toContainText(
    'Choose an image-enabled model',
  );
  await page.getByRole('button', { name: 'Preview report.pdf', exact: true }).click();
  const pdf = page.getByRole('dialog', { name: 'report.pdf', exact: true });
  await expect(pdf.locator('.attachment-text-preview')).toContainText('Revenue target: 128');
  await expect(pdf.getByRole('link', { name: 'Download', exact: true })).toHaveAttribute(
    'href',
    /\/api\/attachments\/[^/]+\/content$/,
  );
  await pdf.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Preview chart.png', exact: true }).click();
  const image = page.getByRole('dialog', { name: 'chart.png', exact: true });
  await expect
    .poll(() =>
      image.getByRole('img').evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await image.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Remove attachment chart.png', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(['Name,Revenue\nAttachment import,128'], 'budget.csv', { type: 'text/csv' }),
    );
    return data;
  });
  await page.locator('.copilot-pane').dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(page.getByText('Drop files to attach', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.attachment-drop-overlay')).toHaveCount(0);
  await page.locator('.copilot-pane').dispatchEvent('dragenter', { dataTransfer: transfer });
  await page.locator('.copilot-pane').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.locator('.attachment-drop-overlay')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Preview budget.csv', exact: true })).toBeEnabled();
  expect(new URL(page.url()).searchParams.get('file')).toBe(fileId);
  const { files } = await (await page.request.get('/api/files')).json();
  expect(files.some((value: { name: string }) => value.name === 'budget')).toBe(true);
  await input(page).setInputFiles(file('fifth.txt', Buffer.from('Fifth attachment')));
  await expect(cards(page)).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Preview fifth.txt', exact: true })).toBeEnabled();
  await input(page).setInputFiles(file('sixth.txt', Buffer.from('Over the limit')));
  await expect(page.getByRole('alert')).toContainText('up to five files');
  await expect(cards(page)).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const composer = (await page.locator('.composer').boundingBox())!;
  expect(composer.x).toBeGreaterThanOrEqual(0);
  expect(composer.x + composer.width).toBeLessThanOrEqual(390);
});

test('keeps uploads with their original chat, removes pending files, and retries failed uploads', async ({
  page,
}) => {
  await ready(page);
  const fileId = new URL(page.url()).searchParams.get('file');
  const { conversations } = await (
    await page.request.get(`/api/conversations?fileId=${fileId}`)
  ).json();
  await page.request.patch(`/api/conversations/${conversations[0].id}`, {
    data: { title: 'Upload draft' },
  });
  await page.reload();
  await expect(page.getByLabel('Message Copilot')).toBeEnabled();
  let release!: () => void,
    attempts = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/conversations/*/attachments?*', async (route) => {
    const name = new URL(route.request().url()).searchParams.get('filename');
    if (name === 'slow.md') await gate;
    if (name === 'retry.txt' && ++attempts === 1) {
      await route.fulfill({
        status: 422,
        json: { error: { message: 'Temporary upload failure. Retry this file.' } },
      });
      return;
    }
    await route.continue();
  });
  await input(page).setInputFiles([
    file('slow.md', Buffer.from('# Slow upload')),
    file('retry.txt', Buffer.from('Retry content')),
  ]);
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Start something useful' })).toHaveCount(0);
  await page.getByLabel('Message Copilot').fill('Draft stays editable during upload');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click();
  await page.getByRole('button', { name: 'Upload draft', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByLabel('Message Copilot')).toHaveValue(
    'Draft stays editable during upload',
  );
  await page.getByRole('button', { name: 'Remove attachment slow.md', exact: true }).click();
  release();
  await expect(page.getByRole('alert')).toContainText('Temporary upload failure');
  await page.getByRole('button', { name: 'Retry retry.txt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview retry.txt', exact: true })).toBeEnabled();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Preview slow.md', exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
});

test('shows actual attachment metadata in sent messages and restores the cards when reopening a chat', async ({
  page,
}) => {
  await ready(page, false);
  const profile = (
    await (
      await page.request.post('/api/provider-profiles', {
        data: { name: 'Attachment fixture', provider: 'openai', model: 'fixture' },
      })
    ).json()
  ).profile;
  await page.reload();
  await expect(page.getByLabel('Message Copilot')).toBeEnabled();
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Manage models', exact: true }).click();
  await page.getByRole('combobox', { name: 'Configuration', exact: true }).click();
  await page.getByRole('option', { name: 'Attachment fixture', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('fixture-page-key');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Attachment fixture/ }).click();
  const response = page.waitForResponse(
    (value) => value.url().includes('/attachments?') && value.request().method() === 'POST',
  );
  await input(page).setInputFiles(file('message.md', Buffer.from('# Actual saved reference')));
  const uploaded: ChatAttachment = (await (await response).json()).attachment;
  await expect(page.getByRole('button', { name: 'Preview message.md', exact: true })).toBeEnabled();
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const { conversations } = await (
    await page.request.get(`/api/conversations?fileId=${fileId}`)
  ).json();
  const conversation = conversations[0],
    now = Date.now(),
    run = {
      id: 'attachment-ui-run',
      conversationId: conversation.id,
      fileId,
      status: 'running',
      createdAt: now,
      error: null,
    };
  const messages = [
    {
      id: 'attachment-user',
      conversationId: conversation.id,
      role: 'user',
      text: 'Read the attachment',
      reasoning: '',
      runId: run.id,
      createdAt: now,
      attachments: [uploaded],
    },
    {
      id: 'attachment-assistant',
      conversationId: conversation.id,
      role: 'assistant',
      text: 'Attachment received.',
      reasoning: '',
      runId: run.id,
      createdAt: now + 1,
    },
  ];
  // Only the model transport is a fixture; upload, extraction and preview use the real server.
  await page.route('**/api/agent/runs', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      profileId: profile.id,
      attachmentIds: [uploaded.id],
      referencedFileIds: [],
    });
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          JSON.stringify({ run }),
          JSON.stringify({
            event: {
              runId: run.id,
              seq: 1,
              type: 'text.delta',
              at: now,
              data: { text: 'Attachment received.' },
            },
          }),
          JSON.stringify({
            event: { runId: run.id, seq: 2, type: 'run.completed', at: now, data: {} },
          }),
        ].join('\n') + '\n',
    });
  });
  await page.route(`**/api/conversations/${conversation.id}`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { conversation, messages } })
      : route.continue(),
  );
  await page.getByLabel('Message Copilot').fill('Read the attachment');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Attachment received.', { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await expect(
    page
      .locator('.chat-message-user')
      .getByRole('button', { name: 'Preview message.md', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator('.chat-message-user')
      .getByRole('button', { name: 'Preview message.md', exact: true }),
  ).toBeVisible();
});
