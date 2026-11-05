import { describe, expect, it } from 'vitest';
import type { OfficeFile } from '@univer-copilot/shared';
import type { OfficeGateway } from '../src/office/contracts.ts';
import { createOfficeVerification } from '../src/modules/copilot/verification.ts';

function fixture(type: OfficeFile['type'] = 'sheet') {
  let head = 5;
  let rendered = 0;
  let duringRender = () => {};
  let findings: unknown[] = [];
  let issues: unknown[] = [];
  let failRead = false;
  const office = {
    revision: async () => head,
    execute: async () => {
      if (failRead) throw new Error('Wrong total');
      return { summary: 'Assertions passed', checked: true };
    },
    visual: async (_file: unknown, _actor: unknown, target: { kind: string }) => {
      if (target.kind === 'lint') return { report: { findings } };
      rendered++;
      duringRender();
      return {
        images: [
          {
            url: '/preview.png',
            width: 600,
            height: 400,
            ...(type === 'board'
              ? {
                  layoutAnalysis: {
                    source: 'rendered',
                    issues,
                    summary: { unresolvedConnectorCount: 0 },
                  },
                }
              : {}),
          },
        ],
      };
    },
  } as unknown as OfficeGateway;
  return {
    verification: createOfficeVerification({
      office,
      file: { type, unitId: 'unit' } as OfficeFile,
      actor: 'actor',
      runId: 'run',
      signal: AbortSignal.timeout(10000),
      latestChange: () => 5,
      publish: async (r) => r,
    }),
    changeDuringRender: () => {
      duringRender = () => {
        head++;
      };
    },
    setFindings: (value: unknown[]) => {
      findings = value;
      issues = value;
    },
    failRead: () => {
      failRead = true;
    },
    rendered: () => rendered,
  };
}
const args = {
  code: 'assert(actual===expected)',
  target: { range: 'A1:C5', pages: [1] },
  intentionalWarnings: [],
};

describe('saved-head verification', () => {
  it('rejects a head that changed between readback and rendered capture', async () => {
    const f = fixture();
    f.changeDuringRender();
    await expect(f.verification.verify(args)).rejects.toThrow('changed during verification');
  });
  it('does not render or grant a receipt when native assertions fail', async () => {
    const f = fixture();
    f.failRead();
    await expect(f.verification.verify(args)).rejects.toThrow('Wrong total');
    expect(f.rendered()).toBe(0);
  });
  it('requires evidence targets for paged products and spreadsheets', async () => {
    for (const type of ['doc', 'slide', 'sheet'] as const)
      await expect(fixture(type).verification.verify({ ...args, target: {} })).rejects.toThrow(
        'Specify',
      );
  });
  it('requires exact, justified Slide warnings; Board errors cannot be acknowledged away', async () => {
    const slide = fixture('slide');
    slide.setFindings([{ fingerprint: 'overlap-1', severity: 'warning', detail: 'Overlap' }]);
    await expect(slide.verification.verify(args)).rejects.toThrow('overlap-1');
    await expect(
      slide.verification.verify({
        ...args,
        intentionalWarnings: [{ id: 'different', reason: 'Intentional overlapping title' }],
      }),
    ).rejects.toThrow('overlap-1');
    expect(
      (
        await slide.verification.verify({
          ...args,
          intentionalWarnings: [
            { id: 'overlap-1', reason: 'Intentional overlapping title in this cover layout' },
          ],
        })
      ).head,
    ).toBe(5);
    const board = fixture('board');
    board.setFindings([{ id: 'broken', severity: 'error', rule: 'connector-label-overflow' }]);
    await expect(board.verification.verify(args)).rejects.toThrow('Repair these layout findings');
  });
});
