import { test, expect, type Page } from '@playwright/test';

const picker = (page: Page) =>
  page.getByRole('dialog', { name: 'Conversation history', exact: true });
async function chooseMode(page: Page, name: 'Ask' | 'Edit') {
  await page.getByRole('button', { name: 'Copilot mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}
async function choose(page: Page, title: string) {
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click();
  await picker(page).getByRole('button', { name: title, exact: true }).click();
  await expect(picker(page)).toBeHidden();
}
async function rename(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click();
  await picker(page)
    .getByRole('button', { name: `Manage ${from}`, exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Conversation name', { exact: true }).fill(to);
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(picker(page).getByRole('button', { name: to, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
}

test('manages per-file conversations, keeps drafts and modes separate, and remembers the selected chat', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Message Copilot', { exact: true });
  await expect(input).toBeEnabled();
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const versions = async () =>
    (await (await page.request.get(`/api/files/${fileId}/versions`)).json()).versions;
  const before = await versions();
  await rename(page, 'New conversation', 'Budget review');
  await input.fill('Keep the budget draft');
  await chooseMode(page, 'Edit');
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(input).toHaveValue('');
  await rename(page, 'New conversation', 'Research notes');
  await input.fill('Keep the research draft');
  await choose(page, 'Budget review');
  await expect(input).toHaveValue('Keep the budget draft');
  await expect(page.getByRole('button', { name: 'Copilot mode', exact: true })).toHaveText('Edit');
  await choose(page, 'Research notes');
  await expect(input).toHaveValue('Keep the research draft');
  await expect(page.getByRole('button', { name: 'Copilot mode', exact: true })).toHaveText('Ask');
  await choose(page, 'Budget review');
  await page.reload();
  await expect(page.locator('.save-state')).toContainText('Saved');
  await expect(
    page.getByRole('button', { name: 'Conversation history', exact: true }),
  ).toContainText('Budget review');
  await expect(page.getByRole('button', { name: 'Copilot mode', exact: true })).toHaveText('Edit');
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click();
  await picker(page)
    .getByRole('textbox', { name: 'Search conversations', exact: true })
    .fill('research');
  await expect(
    picker(page).getByRole('button', { name: 'Research notes', exact: true }),
  ).toBeVisible();
  await expect(
    picker(page).getByRole('button', { name: 'Budget review', exact: true }),
  ).toHaveCount(0);
  await picker(page)
    .getByRole('textbox', { name: 'Search conversations', exact: true })
    .fill('missing-chat');
  await expect(picker(page)).toContainText('No conversations match your search.');
  await picker(page).getByRole('textbox', { name: 'Search conversations', exact: true }).fill('');
  await picker(page).getByRole('button', { name: 'Manage Budget review', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete conversation', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete conversation?', exact: true });
  await expect(confirmation).toContainText('File content and versions will be preserved');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    picker(page).getByRole('button', { name: 'Budget review', exact: true }),
  ).toBeVisible();
  await picker(page).getByRole('button', { name: 'Manage Budget review', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete conversation', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Delete conversation', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(picker(page)).toBeVisible();
  await expect(
    picker(page).getByRole('button', { name: 'Budget review', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Conversation history', exact: true }),
  ).toContainText('Research notes');
  expect(await versions()).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click();
  const box = (await picker(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(10);
  expect(box.x + box.width).toBeLessThanOrEqual(380);
});

test('switches away from a live chat without mixing its stream or losing received deltas', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Message Copilot', { exact: true })).toBeEnabled();
  const fileId = new URL(page.url()).searchParams.get('file')!;
  const { conversations } = await (
    await page.request.get(`/api/conversations?fileId=${fileId}`)
  ).json();
  const first = conversations[0];
  await page.request.patch(`/api/conversations/${first.id}`, { data: { title: 'Live budget' } });
  const { conversation: second } = await (
    await page.request.post('/api/conversations', { data: { fileId, title: 'Research notes' } })
  ).json();
  let done = false;
  const run = {
    id: 'fixture-background',
    conversationId: first.id,
    fileId,
    status: 'running',
    createdAt: Date.now(),
    error: null,
  };
  const partial = {
    id: 'partial',
    conversationId: first.id,
    role: 'assistant',
    text: 'Only the budget chat receives this answer.',
    reasoning: '',
    runId: run.id,
    createdAt: run.createdAt,
  };
  await page.route(`**/api/conversations/${first.id}/runs`, (route) =>
    route.fulfill({ json: { runs: [{ ...run, status: done ? 'completed' : 'running' }] } }),
  );
  await page.route(`**/api/conversations/${first.id}`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            conversation: { ...first, title: 'Live budget' },
            messages: done ? [partial] : [],
          },
        })
      : route.continue(),
  );
  await page.route(`**/api/agent/runs/${run.id}/events?**`, (route) => {
    const after = Number(new URL(route.request().url()).searchParams.get('after'));
    return route.fulfill({
      json: {
        events: after
          ? []
          : [
              {
                runId: run.id,
                seq: 1,
                at: Date.now(),
                type: 'text.delta',
                data: { text: partial.text },
              },
            ],
      },
    });
  });
  await page.route(`**/api/agent/runs/${run.id}`, (route) =>
    route.fulfill({ json: { run: { ...run, status: done ? 'completed' : 'running' } } }),
  );
  await page.reload();
  await expect(page.getByText(partial.text, { exact: true })).toBeVisible();
  await choose(page, second.title);
  await expect(
    page.getByText('Copilot is running in another conversation.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(partial.text, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Message Copilot', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByText(partial.text, { exact: true })).toHaveCount(1);
  await choose(page, second.title);
  done = true;
  await choose(page, 'Live budget');
  await expect(page.getByRole('button', { name: 'Stop Copilot', exact: true })).toHaveCount(0);
  await expect(page.getByText(partial.text, { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Message Copilot', { exact: true })).toBeEnabled();
});
