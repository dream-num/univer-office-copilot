import { describe, expect, it } from 'vitest';
import { rebaseUnitData } from '../src/office/transfer.ts';

describe('native import identities', () => {
  it('rejects deeply encoded plugin data as invalid content rather than leaving an unrecoverable create', () => {
    expect(() =>
      rebaseUnitData(
        {
          id: 'old-unit',
          resources: [
            { name: 'SHEET_CHART_PLUGIN', data: '['.repeat(2000) + 'null' + ']'.repeat(2000) },
          ],
        },
        'new-unit',
      ),
    ).toThrow('nested too deeply');
  });
  it('retargets internal Unit references, including encoded plugin resources, without changing content or foreign Units', () => {
    const source = {
      id: 'old-unit',
      body: { dataStream: 'old-unit is literal document text' },
      native: { unitId: 'old-unit', nested: [{ unitID: 'old-unit' }, { unitId: 'foreign-unit' }] },
      resources: [
        {
          name: 'SHEET_CHART_PLUGIN',
          data: JSON.stringify({
            sheet: [{ rangeInfo: { unitId: 'old-unit', subUnitId: 'sheet' } }],
          }),
        },
        {
          name: 'SHEET_DRAWING_PLUGIN',
          data: JSON.stringify({ sheet: { data: { drawing: { unitId: 'old-unit' } } } }),
        },
        { name: 'OPAQUE', data: 'unchanged non-JSON payload' },
      ],
    };
    const result = rebaseUnitData(source, 'new-unit');
    expect(result.id).toBe('new-unit');
    expect(result.native).toEqual({
      unitId: 'new-unit',
      nested: [{ unitID: 'new-unit' }, { unitId: 'foreign-unit' }],
    });
    expect(result.body).toEqual(source.body);
    const resources = result.resources as typeof source.resources;
    expect(JSON.parse(resources[0]!.data).sheet[0].rangeInfo).toEqual({
      unitId: 'new-unit',
      subUnitId: 'sheet',
    });
    expect(JSON.parse(resources[1]!.data).sheet.data.drawing.unitId).toBe('new-unit');
    expect(resources[2]).toEqual(source.resources[2]);
    expect(source.native.unitId).toBe('old-unit');
    expect(JSON.parse(source.resources[0]!.data).sheet[0].rangeInfo.unitId).toBe('old-unit');
  });
});
