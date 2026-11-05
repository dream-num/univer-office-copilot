import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../src/bootstrap/app.ts';
import type { OfficeAction, OfficeFile } from '@univer-copilot/shared';

describe('file import and export through the real Office SDK', () => {
  let app: Awaited<ReturnType<typeof createApplication>>,
    dir: string,
    origin: string,
    cookie: string,
    actor: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'copilot-transfer-'));
    app = await createApplication({ host: '127.0.0.1', port: 0, demo: true, dataDir: dir });
    origin = `http://127.0.0.1:${await app.start()}`;
    const response = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
    cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    actor = ((await response.json()) as { user: { id: string } }).user.id;
  });
  afterAll(async () => {
    await app?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  async function upload(bytes: Uint8Array, filename: string, target?: string, auth = cookie) {
    return fetch(
      `${origin}/api/files/import?${new URLSearchParams({ filename, ...(target ? { target } : {}) })}`,
      {
        method: 'POST',
        headers: { Cookie: auth, 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(bytes),
      },
    );
  }
  const cases: { type: OfficeFile['type']; action: OfficeAction; text: string }[] = [
    {
      type: 'sheet',
      action: { kind: 'sheet.write', range: 'A1:B1', values: [['Transfer marker', 42]] },
      text: 'Transfer marker',
    },
    {
      type: 'doc',
      action: { kind: 'doc.append', text: 'Transfer paragraph' },
      text: 'Transfer paragraph',
    },
    {
      type: 'slide',
      action: { kind: 'slide.add', title: 'Transfer slide', body: 'Round trip content' },
      text: 'Transfer slide',
    },
    {
      type: 'base',
      action: { kind: 'base.add', values: { Project: 'Transfer base', Score: 42 } },
      text: 'Transfer base',
    },
    {
      type: 'board',
      action: { kind: 'board.text', text: 'Transfer board', x: 100, y: 100 },
      text: 'Transfer board',
    },
  ];
  for (const { type, action, text } of cases)
    it(`preserves ${type} content in native JSON and creates a new identity`, async () => {
      const { files, office } = app.services;
      const file = await files.create(actor, type, `Native ${type}`);
      await office.execute(
        file,
        actor,
        randomUUID(),
        randomUUID(),
        action,
        AbortSignal.timeout(40000),
      );
      const response = await fetch(`${origin}/api/files/${file.id}/export?format=native`, {
        headers: { Cookie: cookie },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain('.univer.json');
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(Buffer.from(bytes).toString()).toContain(text);
      const imported = await upload(bytes, 'copy.univer.json');
      expect(imported.status, await imported.clone().text()).toBe(201);
      const copy = ((await imported.json()) as { file: OfficeFile }).file;
      expect(copy.unitId).not.toBe(file.unitId);
      expect(copy.ownerId).toBe(actor);
      expect(copy.type).toBe(type);
      expect(JSON.stringify(await office.snapshot(copy, actor))).toContain(text);
      expect(((await office.inspect(copy, actor)) as { revision: number }).revision).toBe(1);
    });
  // Office conversion consumes SDK export quota, including on the Free policy.
  for (const { type, action, text } of cases.filter((item) => item.type !== 'board'))
    it.skipIf(process.env.TEST_OFFICE_CONVERSION !== 'true')(
      `roundtrips ${type} through Office conversion`,
      async () => {
        const { files, office } = app.services;
        const file = await files.create(actor, type, `Office ${type}`);
        await office.execute(
          file,
          actor,
          randomUUID(),
          randomUUID(),
          action,
          AbortSignal.timeout(40000),
        );
        const converted = await fetch(`${origin}/api/files/${file.id}/export?format=office`, {
          headers: { Cookie: cookie },
        });
        expect(converted.status, await converted.clone().text()).toBe(200);
        const extension = type === 'doc' ? 'docx' : type === 'slide' ? 'pptx' : 'xlsx';
        const result = await upload(
          new Uint8Array(await converted.arrayBuffer()),
          `copy.${extension}`,
          type,
        );
        expect(result.status, await result.clone().text()).toBe(201);
        const officeCopy = ((await result.json()) as { file: OfficeFile }).file;
        expect(JSON.stringify(await office.snapshot(officeCopy, actor))).toContain(text);
        if (type === 'doc') expect(officeCopy.documentFlavor).toBe('traditional');
      },
    );
  it('imports CSV into Sheets or Base, rejects invalid content before creating metadata, and requires access', async () => {
    for (const target of ['sheet', 'base']) {
      const response = await upload(Buffer.from('Name,Score\nCSV marker,42'), 'data.csv', target);
      expect(response.status, await response.clone().text()).toBe(201);
      const file = ((await response.json()) as { file: OfficeFile }).file;
      expect(file.type).toBe(target);
      expect(JSON.stringify(await app.services.office.snapshot(file, actor))).toContain(
        'CSV marker',
      );
    }
    const count = app.services.files.list(actor).length;
    expect((await upload(Buffer.from('{}'), 'broken.univer.json')).status).toBe(422);
    expect((await upload(Buffer.from('fake'), 'broken.xlsx')).status).toBe(422);
    expect((await upload(Buffer.from('hello'), 'unknown.txt')).status).toBe(400);
    expect((await upload(Buffer.alloc(0), 'empty.csv')).status).toBe(400);
    expect(app.services.files.list(actor)).toHaveLength(count);
    expect((await upload(Buffer.from('x'), 'data.csv', undefined, '')).status).toBe(401);
    const file = app.services.files.list(actor)[0]!;
    expect((await fetch(`${origin}/api/files/${file.id}/export?format=native`)).status).toBe(401);
    expect(
      (await fetch(`${origin}/api/files/${randomUUID()}/export`, { headers: { Cookie: cookie } }))
        .status,
    ).toBe(403);
  });
  it('recovers an interrupted import with its content and preserves Modern Doc authoring maps', async () => {
    const { files, office } = app.services;
    const source = await files.create(actor, 'doc', 'Modern source');
    await office.execute(
      source,
      actor,
      randomUUID(),
      randomUUID(),
      {
        kind: 'doc.markdown',
        mode: 'replace',
        markdown: '# Portable heading\n\nPortable paragraph',
      },
      AbortSignal.timeout(40000),
    );
    const exported = await office.export(source, actor, 'native');
    const initial = await office.import(exported.bytes, 'modern.univer.json');
    expect(initial.documentState).toBeDefined();
    const pending = { ...source, id: randomUUID(), unitId: randomUUID() };
    app.db
      .prepare('INSERT INTO operations VALUES(?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        actor,
        pending.id,
        'create',
        'prepared',
        JSON.stringify({ file: pending, initial }),
        Date.now(),
      );
    await files.recoverCreates();
    const copy = files.get(pending.id, actor);
    expect(copy.documentFlavor).toBe('modern');
    const recovered = await office.export(copy, actor, 'native');
    expect(JSON.parse(Buffer.from(recovered.bytes).toString()).documentState).toEqual(
      initial.documentState,
    );
    const read = await office.execute(
      copy,
      actor,
      randomUUID(),
      randomUUID(),
      { kind: 'doc.markdown.read' },
      AbortSignal.timeout(40000),
    );
    expect(JSON.stringify(read.content)).toContain('Portable paragraph');
  });
  it('enforces upload size and export permissions for other users', async () => {
    const oversized = await upload(Buffer.alloc(20 * 1024 * 1024 + 1), 'large.csv');
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).error.code).toBe('FILE_TOO_LARGE');
    const response = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
    const otherCookie = response.headers.get('set-cookie')!.split(';')[0]!;
    const other = (await response.json()).user;
    const file = app.services.files.list(actor)[0]!;
    const request = () =>
      fetch(`${origin}/api/files/${file.id}/export?format=native`, {
        headers: { Cookie: otherCookie },
      });
    expect((await request()).status).toBe(403);
    await app.services.files.setPermission(file.id, actor, other.email, 'viewer');
    expect((await request()).status).toBe(200);
    await app.services.files.setPermission(file.id, actor, other.email, null);
    expect((await request()).status).toBe(403);
  });
});
