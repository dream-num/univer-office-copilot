import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../src/bootstrap/app.ts';
import type { OfficeAction } from '@univer-copilot/shared';
import { LAYOUT_PAGE_IDS, SlidePageLayoutTypeEnum } from '@univerjs-pro/slides';

describe('real Office SDK persistence and versions', () => {
  let application: Awaited<ReturnType<typeof createApplication>>, directory: string, actor: string;
  let origin: string, cookie: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'office-copilot-test-'));
    application = await createApplication({
      host: '127.0.0.1',
      port: 0,
      demo: true,
      dataDir: directory,
    });
    const port = await application.start();
    origin = `http://127.0.0.1:${port}`;
    const response = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
    cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    actor = ((await response.json()) as { user: { id: string } }).user.id;
  });
  afterAll(async () => {
    await application?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('waits for formulas before readback and preserves recalculation across worker reloads', async () => {
    const { files, office } = application.services;
    const file = await files.create(actor, 'sheet', 'Formula barrier test');
    const execute = (action: OfficeAction) =>
      office.execute(file, actor, randomUUID(), randomUUID(), action, AbortSignal.timeout(40000));
    const written = await execute({
      kind: 'sheet.write',
      range: 'A1:C3',
      values: [
        ['Q1', 'Q2', 'Growth (%)'],
        [120, 150, '=ROUND((B2/A2-1)*100,2)'],
        ['=SUM(A2:A2)', '=SUM(B2:B2)', '=ROUND((B3/A3-1)*100,2)'],
      ],
    });
    expect(written.content).toEqual([
      ['Q1', 'Q2', 'Growth (%)'],
      [120, 150, 25],
      [120, 150, 25],
    ]);
    await execute({ kind: 'sheet.write', range: 'A2', values: [[200]] });
    const reloaded = await execute({ kind: 'sheet.read', range: 'A1:C3' });
    expect(reloaded.content).toEqual([
      ['Q1', 'Q2', 'Growth (%)'],
      [200, 150, -25],
      [200, 150, -25],
    ]);
  });
  it('creates AI slide content on a blank layout without inherited placeholder text', async () => {
    const { files, office } = application.services;
    const file = await files.create(actor, 'slide', 'Clean slide');
    await office.execute(
      file,
      actor,
      randomUUID(),
      randomUUID(),
      {
        kind: 'slide.add',
        title: 'Quarterly review',
        body: 'Revenue grew by 18.86%.',
      },
      AbortSignal.timeout(40000),
    );
    const snapshot = (await (
      await fetch(`${origin}/universer-api/snapshot/3/unit/${file.unitId}/rev/0`, {
        headers: { Cookie: cookie },
      })
    ).json()) as { changesets: { mutations: { id: string; data: string }[] }[] };
    const addition = snapshot.changesets
      .flatMap((change) => change.mutations)
      .find((mutation) => mutation.id === 'slide.mutation.add-slide-page');
    expect(addition).toBeDefined();
    const created = JSON.parse(addition!.data).slide as { layoutPageId: string };
    expect(created.layoutPageId).toBe(LAYOUT_PAGE_IDS[SlidePageLayoutTypeEnum.Blank]);
  });
  const operations: {
    type: 'sheet' | 'doc' | 'slide' | 'base' | 'board';
    action: OfficeAction;
    expected: string;
  }[] = [
    {
      type: 'sheet',
      action: { kind: 'sheet.write', range: 'A1:B1', values: [['Revenue', 42]] },
      expected: 'Revenue',
    },
    {
      type: 'doc',
      action: { kind: 'doc.append', text: 'A persisted paragraph' },
      expected: 'A persisted paragraph',
    },
    {
      type: 'slide',
      action: { kind: 'slide.add', title: 'Quarterly result', body: 'Revenue grew.' },
      expected: 'Quarterly result',
    },
    {
      type: 'base',
      action: { kind: 'base.add', values: { Project: 'Copilot sample', Score: 42 } },
      expected: 'Copilot sample',
    },
    {
      type: 'board',
      action: { kind: 'board.text', text: 'Collaborative canvas', x: 100, y: 100 },
      expected: 'Collaborative canvas',
    },
  ];
  for (const { type, action, expected } of operations)
    it(`writes, reloads and restores ${type}`, async () => {
      const { files, office } = application.services;
      const file = await files.create(actor, type, `Test ${type}`);
      const signal = AbortSignal.timeout(40000);
      await office.execute(file, actor, randomUUID(), randomUUID(), action, signal);
      const loaded = await office.execute(
        file,
        actor,
        randomUUID(),
        randomUUID(),
        { kind: 'inspect' },
        signal,
      );
      expect(JSON.stringify(loaded.content)).toContain(expected);
      const current = (await office.inspect(file, actor)) as { revision: number };
      expect(current.revision).toBeGreaterThan(1);
      const preview = (await office.preview(file, actor, current.revision)) as { data: unknown };
      const initial = (await office.preview(file, actor, 1)) as { data: unknown };
      expect(JSON.stringify(preview.data)).toContain(expected);
      expect(JSON.stringify(initial.data)).not.toContain(expected);
      if (type === 'sheet')
        await expect(office.restore(file, actor, 1, 1)).rejects.toMatchObject({
          code: 'REVISION_CHANGED',
        });
      expect((await office.versions(file, actor)).some((v) => v.revision > 1)).toBe(true);
      const restoredRevision = await office.restore(file, actor, 1, current.revision);
      expect(restoredRevision).toBeGreaterThan(current.revision);
      const restored = await office.execute(
        file,
        actor,
        randomUUID(),
        randomUUID(),
        { kind: 'inspect' },
        signal,
      );
      expect(JSON.stringify(restored.content)).not.toContain(expected);
    });
});
