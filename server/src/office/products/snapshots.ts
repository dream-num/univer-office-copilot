import {
  getBasesEmptySnapshot,
  getDocsEmptySnapshot,
  LocaleType,
  DocumentFlavor,
} from '@univerjs/core';
import { getSlidesEmptySnapshot } from '@univerjs-pro/slides';
import { getBoardsEmptySnapshot } from '@univerjs-pro/boards';
import type { CreateUnitFromDataInput } from '@univerjs-pro/collaboration-service';
import type { FileType, OfficeFile } from '@univer-copilot/shared';

export const unitTypes = { doc: 1, sheet: 2, slide: 3, base: 5, board: 6 } as const;
export function emptyUnit(
  file: Pick<OfficeFile, 'unitId' | 'type' | 'name' | 'documentFlavor'>,
): CreateUnitFromDataInput {
  const id = file.unitId;
  switch (file.type) {
    case 'sheet':
      return {
        type: 2,
        data: {
          id,
          rev: 1,
          name: file.name,
          appVersion: '1.3.1',
          locale: LocaleType.EN_US,
          sheetOrder: ['sheet-1'],
          sheets: {
            'sheet-1': {
              id: 'sheet-1',
              name: 'Sheet1',
              rowCount: 1000,
              columnCount: 26,
              cellData: {},
            },
          },
          styles: {},
          resources: [],
        },
      };
    case 'doc':
      return {
        type: 1,
        data: {
          ...getDocsEmptySnapshot(
            id,
            LocaleType.EN_US,
            file.name,
            file.documentFlavor === 'traditional'
              ? DocumentFlavor.TRADITIONAL
              : DocumentFlavor.MODERN,
          ),
          rev: 1,
        },
      };
    case 'slide':
      return {
        type: 3,
        data: { ...getSlidesEmptySnapshot(id, LocaleType.EN_US, file.name), rev: 1 },
      };
    case 'base':
      return { type: 5, data: { ...getBasesEmptySnapshot(id), name: file.name, rev: 1 } };
    case 'board':
      return { type: 6, data: { ...getBoardsEmptySnapshot(id, file.name), rev: 1 } };
  }
}
export function typeFromUnit(value: number): FileType {
  const type = (Object.entries(unitTypes) as [FileType, number][]).find(
    ([, id]) => id === value,
  )?.[0];
  if (!type) throw new Error('Unsupported Unit type');
  return type;
}
