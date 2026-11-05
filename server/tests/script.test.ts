import { describe, expect, it } from 'vitest';
import type { FUniver } from '@univerjs/core/facade';
import type { OfficeFile } from '@univer-copilot/shared';
import { executeFacadeScript } from '../src/office/authoring/script.ts';

class Range {
  constructor(private data: number[]) {}
  async setValues(values: number[]) {
    await Promise.resolve();
    this.data.splice(0, this.data.length, ...values);
    return this;
  }
  async setFailing() {
    throw new Error('Native write rejected');
  }
  getValues() {
    return this.data.slice();
  }
}
class Unit {
  constructor(private data: number[]) {}
  getRange() {
    return new Range(this.data);
  }
}
function fixture(type = 'sheet') {
  const data: number[] = [];
  const unit = new Unit(data);
  const get = () => unit;
  const api = {
    getWorkbook: get,
    getDocument: get,
    getPresentation: get,
    getBase: get,
    getBoard: get,
    Enum: {},
  } as unknown as FUniver;
  const file = { id: 'file', unitId: 'unit', type, name: 'Test' } as OfficeFile;
  return { data, api, file };
}

describe('isolated CLI-style Facade scripts', () => {
  for (const [type, binding] of [
    ['sheet', 'workbook'],
    ['doc', 'doc'],
    ['slide', 'presentation'],
    ['base', 'base'],
    ['board', 'board'],
  ]) {
    it(`binds the fixed ${type} and supports functions, loops, async calls and readback`, async () => {
      const { api, file, data } = fixture(type);
      const result = await executeFacadeScript(
        api,
        file,
        `
        function rows() { const values=[]; for(let i=1;i<=5;i++) values.push(i*2); return values; }
        const range=${binding}.getRange('A1');
        await range.setValues(rows());
        const actual=await range.getValues();
        assert(actual.reduce((a,b)=>a+b,0)===30,'Totals differ');
        return actual.map(value=>value/2);
      `,
        'write',
      );
      expect(data).toEqual([2, 4, 6, 8, 10]);
      expect(result.result).toEqual([1, 2, 3, 4, 5]);
      expect(result.assertions).toBe(1);
    });
  }
  it('denies mutation in read/verification mode, other Units and host access', async () => {
    for (const code of [
      "workbook.getRange('A1').setValues([42])",
      "univerAPI.getWorkbook('other')",
      'univerAPI.createWorkbook({})',
      'workbook.getInjector()',
      'return workbook._injector',
      'return process.env',
      "return require('node:fs')",
      "return fetch('https://example.com')",
      "return import('node:fs')",
      "return workbook.getRange('A1').getValues().constructor.constructor('return process')()",
    ]) {
      const { api, file, data } = fixture();
      await expect(executeFacadeScript(api, file, code, 'read')).rejects.toThrow();
      expect(data).toEqual([]);
    }
  });
  it('requires real readback and assertions and preserves a caught assertion failure', async () => {
    const { api, file } = fixture();
    for (const code of [
      'return 1',
      'assert(true)',
      "workbook.getRange('A1').getValues()",
      "workbook.getRange('A1').getValues();try{assert(false,'Wrong result')}catch{}",
    ])
      await expect(executeFacadeScript(api, file, code, 'verify')).rejects.toThrow();
    expect(
      (
        await executeFacadeScript(
          api,
          file,
          "const values=workbook.getRange('A1').getValues();assert(values.length===0);return values",
          'verify',
        )
      ).assertions,
    ).toBe(1);
  });
  it('uses JavaScript truthiness for native Facades and rejects pending promise assertions', async () => {
    const { api, file } = fixture();
    const result = await executeFacadeScript(
      api,
      file,
      "const range=workbook.getRange('A1');assert(range,'Native range exists');assert([]);return true;",
      'verify',
    );
    expect(result.assertions).toBe(2);
    await expect(
      executeFacadeScript(api, file, "workbook.getRange('A1');assert(false)", 'verify'),
    ).rejects.toThrow('Office assertion failed.');
    await expect(
      executeFacadeScript(
        api,
        file,
        "workbook.getRange('A1');assert(Promise.resolve(false),'Pending');",
        'verify',
      ),
    ).rejects.toThrow('Await');
  });
  it('drains async calls and rejects unawaited native failures', async () => {
    const { api, file } = fixture();
    await expect(
      executeFacadeScript(
        api,
        file,
        "workbook.getRange('A1').setFailing();return 'finished'",
        'write',
      ),
    ).rejects.toThrow('Native write rejected');
    expect(
      (
        await executeFacadeScript(
          api,
          file,
          "workbook.getRange('A1').setValues([9]);return 'finished'",
          'write',
        )
      ).result,
    ).toBe('finished');
  });
  it('interrupts runaway code, bounds memory and rejects native callback arguments', async () => {
    const { api, file } = fixture();
    await expect(
      executeFacadeScript(api, file, 'while(true){}', 'read', { timeoutMs: 40 }),
    ).rejects.toThrow();
    await expect(
      executeFacadeScript(api, file, 'return Array(10000000).fill("oversized")', 'read', {
        memoryBytes: 2 * 1024 * 1024,
      }),
    ).rejects.toThrow();
    await expect(
      executeFacadeScript(api, file, "workbook.getRange('A1').getValues(()=>42)", 'read'),
    ).rejects.toThrow('callback');
    expect((await executeFacadeScript(api, file, 'return 6*7', 'read')).result).toBe(42);
  });
});
