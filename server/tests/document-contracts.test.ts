import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/db/index.ts';
import { createDocumentStateStore } from '../src/office/document-state.ts';
import { isReadAction, officeActionSchema, readOfficeActionSchema } from '@univer-copilot/shared';

describe('document flavors and application metadata', () => {
  const temporary: string[] = [];
  afterEach(async () => {
    for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
  });
  it('keeps current-native reads available in Ask while rejecting both compiler writes', () => {
    const read = readOfficeActionSchema.parse({ kind: 'doc.markdown.read', blockIds: ['summary'] });
    expect(isReadAction(read)).toBe(true);
    for (const action of [
      { kind: 'doc.markdown', mode: 'replace', markdown: '# Title' },
      { kind: 'doc.typst', pages: ['= Title'] },
    ]) {
      expect(officeActionSchema.safeParse(action).success).toBe(true);
      expect(readOfficeActionSchema.safeParse(action).success).toBe(false);
    }
  });
  it('migrates existing file rows without changing their identity or native content', async () => {
    const path = await mkdtemp(join(tmpdir(), 'copilot-doc-migration-'));
    temporary.push(path);
    const filename = join(path, 'application.sqlite');
    const old = new DatabaseSync(filename);
    old.exec(
      "CREATE TABLE files(id TEXT,unit_id TEXT,type TEXT,name TEXT,owner_id TEXT,folder_id TEXT,created_at INTEGER,updated_at INTEGER,deleted_at INTEGER); CREATE TABLE runs(status TEXT,error TEXT); CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,text TEXT,reasoning TEXT,run_id TEXT,created_at INTEGER); INSERT INTO files VALUES('file','native-unit','doc','Existing title','owner',NULL,1,2,NULL); PRAGMA user_version=2;",
    );
    old.close();
    const db = openDatabase(filename);
    try {
      expect(db.prepare('SELECT id,unit_id,name,document_flavor,emoji FROM files').get()).toEqual({
        id: 'file',
        unit_id: 'native-unit',
        name: 'Existing title',
        document_flavor: null,
        emoji: null,
      });
      expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 5 });
    } finally {
      db.close();
    }
  });
  it('restores source-map checkpoints and rejects paths outside the fixed Unit', async () => {
    const path = await mkdtemp(join(tmpdir(), 'copilot-doc-state-'));
    temporary.push(path);
    const state = createDocumentStateStore(path);
    await state.save('unit', 3, { sourceMap: ['first'] });
    await state.save('unit', 5, { sourceMap: ['second'] });
    await state.restore('unit', 4, 6);
    expect(await state.read('unit')).toEqual({ sourceMap: ['first'] });
    await state.restore('unit', 1, 7);
    expect(await state.read('unit')).toBe(null);
    await expect(state.read('../another-unit')).rejects.toThrow('Invalid document identity');
  });
});
