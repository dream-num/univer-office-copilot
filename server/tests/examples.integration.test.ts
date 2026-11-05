import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../src/bootstrap/app.ts';
import { demoExamples } from '../src/bootstrap/examples.ts';
import type { OfficeFile } from '@univer-copilot/shared';

describe('portable default examples', () => {
  let app: Awaited<ReturnType<typeof createApplication>>, directory: string, origin: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'copilot-examples-'));
    app = await createApplication({
      host: '127.0.0.1',
      port: 0,
      demo: true,
      demoExamples: true,
      dataDir: directory,
    });
    origin = `http://127.0.0.1:${await app.start()}`;
  });
  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  async function openDemo() {
    const response = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
    expect(response.status, await response.clone().text()).toBe(200);
    const { user } = (await response.json()) as { user: { id: string } };
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    return { user, cookie };
  }
  it('installs all six current native cases at revision one without conversations or model settings', async () => {
    const { user, cookie } = await openDemo();
    const files = app.services.files.list(user.id);
    expect(files).toHaveLength(6);
    expect(new Set(files.map((f) => f.type))).toEqual(
      new Set(['sheet', 'doc', 'slide', 'base', 'board']),
    );
    expect(
      files
        .filter((f) => f.type === 'doc')
        .map((f) => f.documentFlavor)
        .sort(),
    ).toEqual(['modern', 'traditional']);
    expect(files.some((f) => f.name === 'Sales')).toBe(false);
    for (const entry of demoExamples) {
      const source = JSON.parse(await readFile(resolve('examples', entry.filename), 'utf8'));
      expect(Object.keys(source).sort()).toEqual(
        [
          'data',
          ...(source.documentFlavor ? ['documentFlavor'] : []),
          ...(source.documentState ? ['documentState'] : []),
          'format',
          'name',
          'type',
          'version',
        ].sort(),
      );
      const file = files.find((f) => f.name === source.name)!;
      expect(file.ownerId).toBe(user.id);
      expect(file.unitId).not.toBe(source.data.id);
      const native = (await app.services.office.preview(file, user.id, 1)) as {
        revision: number;
        data: Record<string, unknown>;
      };
      expect(native.revision).toBe(1);
      const content = native.data;
      expect(content.id).toBe(file.unitId);
      if (file.type === 'sheet') {
        const resources = content.resources as { name: string; data: string }[];
        for (const name of ['SHEET_CHART_PLUGIN', 'SHEET_DRAWING_PLUGIN']) {
          const resource = resources.find((r) => r.name === name)!;
          expect(resource.data).toContain(file.unitId);
          expect(resource.data).not.toContain(source.data.id);
        }
        const charts = JSON.parse(resources.find((r) => r.name === 'SHEET_CHART_PLUGIN')!.data);
        for (const chart of Object.values(charts).flat() as {
          context: { seriesIndexes: number[] };
        }[])
          expect(chart.context.seriesIndexes.length).toBeGreaterThan(0);
      }
      if (file.type === 'base') {
        const resources = content.resources as { name: string; data: string }[];
        const dashboards = JSON.parse(
          resources.find((r) => r.name === 'BASE_DASHBOARD_PLUGIN')!.data,
        );
        const widgets = Object.values(dashboards.dashboards).flatMap((d: any) =>
          Object.values(d.widgets),
        );
        expect(widgets).toHaveLength(40);
        expect(widgets.filter((w: any) => w.type === 'pivot-chart')).toHaveLength(15);
      }
      if (source.documentState) {
        const exported = await app.services.office.export(file, user.id, 'native');
        expect(JSON.parse(Buffer.from(exported.bytes).toString()).documentState).toEqual(
          source.documentState,
        );
      }
    }
    for (const table of [
      'profiles',
      'conversations',
      'messages',
      'runs',
      'attachments',
      'file_links',
      'conversation_links',
    ])
      expect(app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    expect(
      (
        (await (await fetch(`${origin}/api/files`, { headers: { Cookie: cookie } })).json()) as {
          files: OfficeFile[];
        }
      ).files,
    ).toHaveLength(6);
    await app.services.files.remove(files[0]!.id, user.id);
    expect(
      (
        (await (await fetch(`${origin}/api/files`, { headers: { Cookie: cookie } })).json()) as {
          files: OfficeFile[];
        }
      ).files,
    ).toHaveLength(5);
  });
  it('creates private copies for another demo account and never seeds normal registrations', async () => {
    const first = app.db.prepare('SELECT id FROM users ORDER BY rowid LIMIT 1').get() as {
      id: string;
    };
    const { user } = await openDemo();
    expect(app.services.files.list(user.id)).toHaveLength(6);
    const foreign = app.services.files.list(first.id)[0]!;
    expect(() => app.services.files.get(foreign.id, user.id)).toThrow('permission');
    expect(new Set(app.services.files.list(user.id).map((f) => f.unitId)).has(foreign.unitId)).toBe(
      false,
    );
    const registered = await fetch(`${origin}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Regular user',
        email: 'regular@example.com',
        password: 'test-password-123',
      }),
    });
    expect(registered.status).toBe(201);
    const value = (await registered.json()) as { user: { id: string } };
    expect(app.services.files.list(value.user.id)).toHaveLength(0);
  });
  it('rejects nested plugin payloads without leaving startup recovery blocked', async () => {
    const { user } = await openDemo();
    const source = JSON.parse(
      await readFile(resolve('examples', 'financial-model.univer.json'), 'utf8'),
    );
    source.data.resources.push({
      name: 'NESTED',
      data: '['.repeat(2000) + 'null' + ']'.repeat(2000),
    });
    await expect(
      app.services.files.importFile(
        user.id,
        Buffer.from(JSON.stringify(source)),
        'bad.univer.json',
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(app.services.files.list(user.id)).toHaveLength(6);
    expect(
      app.db
        .prepare("SELECT COUNT(*) AS n FROM operations WHERE owner_id=? AND status='prepared'")
        .get(user.id),
    ).toEqual({ n: 0 });
    await expect(app.services.files.recoverCreates()).resolves.toBeUndefined();
  });
});
