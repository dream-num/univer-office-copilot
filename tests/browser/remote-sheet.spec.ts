import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../../server/src/bootstrap/app.ts';

test('applies a backend worksheet replacement and keeps recovery notices above Copilot', async ({
  page,
}) => {
  test.setTimeout(90000);
  const directory = await mkdtemp(join(tmpdir(), 'copilot-remote-sheet-'));
  const application = await createApplication({
    host: '127.0.0.1',
    port: 0,
    demo: true,
    dataDir: directory,
  });
  try {
    const origin = `http://127.0.0.1:${await application.start()}`;
    await page.goto(origin);
    await expect(page.locator('.save-state')).toHaveText('Saved');
    const id = new URL(page.url()).searchParams.get('file')!;
    const { owner_id: actor } = application.db
      .prepare('SELECT owner_id FROM files WHERE id=?')
      .get(id) as { owner_id: string };
    const { files, office } = application.services;
    const file = files.get(id, actor);
    await office.execute(
      file,
      actor,
      randomUUID(),
      randomUUID(),
      {
        kind: 'script.write',
        code: `
          const initial = workbook.getActiveSheet();
          const sheets = ['Overview', 'Financials', 'IPO Model', 'Sensitivity', 'Checks']
            .map(name => workbook.create(name, 100, 12));
          workbook.deleteSheet(initial);
          for (const sheet of sheets)
            sheet.getRange('A1:B2').setValues([['Revenue', 'Margin'], [120, '=A2/1000']]);
          return sheets.length;
        `,
      },
      AbortSignal.timeout(40000),
    );
    await expect(page.getByRole('tablist', { name: 'Sheet tabs' }).getByRole('tab')).toHaveCount(5);
    await expect(page.locator('.save-state')).toHaveText('Saved');
    await expect(page.getByRole('status', { name: 'Edit conflicts', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Financials', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeEnabled();
    const read = await office.execute(
      file,
      actor,
      randomUUID(),
      randomUUID(),
      {
        kind: 'script.read',
        code: "return workbook.getSheetByName('Financials').getRange('A1:B2').getRawValues();",
      },
      AbortSignal.timeout(30000),
    );
    expect(read.content).toMatchObject({
      result: [
        ['Revenue', 'Margin'],
        [120, 0.12],
      ],
    });

    // A genuine peer restore exercises the SDK's persistent notification and reload action.
    await office.restore(file, actor, 1, await office.revision(file, actor));
    const refresh = page.getByRole('button', { name: 'Refresh page', exact: true });
    await expect(refresh).toBeVisible();
    await expect
      .poll(() =>
        refresh.evaluate((button) => {
          const rect = button.getBoundingClientRect();
          return button.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          );
        }),
      )
      .toBe(true);
    await refresh.click();
    await expect(page.locator('.save-state')).toHaveText('Saved');
    await expect(page.getByRole('tab', { name: 'Sheet1', exact: true })).toBeVisible();
  } finally {
    await application.close();
    await rm(directory, { recursive: true, force: true });
  }
});
