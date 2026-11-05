import { describe, expect, it } from 'vitest';
import type { FUniver } from '@univerjs/core/facade';
import { executeFacadePlan } from '../src/office/authoring/facade.ts';
import { officeInstructions, readOfficeSkill } from '../src/modules/copilot/skills/index.ts';
import type { OfficeFile } from '@univer-copilot/shared';
import { DatabaseSync } from 'node:sqlite';
import { generatedSource } from '../src/modules/copilot/source.ts';

const file = { id: 'file', unitId: 'unit', type: 'sheet', name: 'Test' } as OfficeFile;
const unit = { getValues: () => [42], setValue: () => true };
const getter = () => unit;
const api = {
  getWorkbook: getter,
  getDocument: getter,
  getPresentation: getter,
  getBase: getter,
  getBoard: getter,
  Enum: {},
} as unknown as FUniver;

describe('native authoring boundary', () => {
  it('rejects mutation in read plans and private/prototype/runtime access', async () => {
    for (const call of [
      { target: 'unit', method: 'setValue', args: [42] },
      { target: 'unit', method: 'constructor', args: [] },
      { target: 'unit', method: 'getDocumentDataModel', args: [] },
      { target: 'api', method: 'getWorkbook', args: ['another-unit'] },
    ])
      await expect(
        executeFacadePlan(api, file, { kind: 'facade.read', calls: [call] }),
      ).rejects.toThrow();
  });
  it('returns serializable read results and rejects unknown handles', async () => {
    expect(
      await executeFacadePlan(api, file, {
        kind: 'facade.read',
        calls: [{ target: 'unit', method: 'getValues', args: [] }],
      }),
    ).toEqual([{ value: [42] }]);
    await expect(
      executeFacadePlan(api, file, {
        kind: 'facade.write',
        calls: [{ target: 'unit', method: 'setValue', args: [{ ref: 'missing' }] }],
      }),
    ).rejects.toThrow('Unknown handle');
  });
  it('loads quality instructions for every product and bounds skill resource paths', async () => {
    for (const product of ['sheet', 'doc', 'slide', 'base', 'board'] as const) {
      const text = await officeInstructions(product);
      expect(text).toContain('Quality loop');
      expect(text).toContain('office_visual');
    }
    expect(await readOfficeSkill('board', 'board/connector-routing.md')).toContain('connector');
    await expect(readOfficeSkill('doc', '../../.env.local')).rejects.toThrow('Unknown bundled');
  });
  it('resolves public Core enums that are not exposed through FEnum', async () => {
    const values: unknown[] = [];
    const target = {
      setValue: (value: unknown) => {
        values.push(value);
        return true;
      },
    };
    const get = () => target;
    const facade = {
      getWorkbook: get,
      getDocument: get,
      getPresentation: get,
      getBase: get,
      getBoard: get,
      Enum: {},
    } as unknown as FUniver;
    await executeFacadePlan(facade, file, {
      kind: 'facade.write',
      calls: [
        { target: 'unit', method: 'setValue', args: [{ enum: 'SpacingRule.AUTO' }] },
        { target: 'unit', method: 'setValue', args: [{ enum: 'FEnum.BorderStyleTypes.THIN' }] },
      ],
    });
    expect(values).toEqual([0, 1]);
  });
  it('keeps generated sources scoped to the actor, file, confirmed operation and page', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(
        'CREATE TABLE operations(owner_id TEXT,file_id TEXT,status TEXT,result_json TEXT,created_at INTEGER)',
      );
      const insert = db.prepare('INSERT INTO operations VALUES(?,?,?,?,?)');
      insert.run(
        'alice',
        'file',
        'confirmed',
        JSON.stringify({ action: { kind: 'slide.svg', page: 1, svg: '<svg>confirmed</svg>' } }),
        1,
      );
      insert.run(
        'alice',
        'file',
        'prepared',
        JSON.stringify({ action: { kind: 'slide.svg', page: 1, svg: '<svg>unconfirmed</svg>' } }),
        2,
      );
      const slide = { ...file, type: 'slide' as const };
      expect(generatedSource(db, slide, 'alice', 1).source).toBe('<svg>confirmed</svg>');
      expect(generatedSource(db, slide, 'bob', 1).source).toBeNull();
      expect(generatedSource(db, { ...slide, id: 'another-file' }, 'alice', 1).source).toBeNull();
      expect(generatedSource(db, slide, 'alice', 2).source).toBeNull();
    } finally {
      db.close();
    }
  });
});
