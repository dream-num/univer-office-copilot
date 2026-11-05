import { inspectContent, type ContentInspectionQuery } from '@univer-cli/content-inspection';
import type { FUniver } from '@univerjs/core/facade';
import type { OfficeAction, OfficeFile } from '@univer-copilot/shared';
import type { OfficeResult } from '../contracts.ts';
import type { CompiledSlideAction } from '../contracts.ts';
import { applyAction } from '../products/actions.ts';
import { executeFacadeScript } from './script.ts';
import { executeFacadePlan } from './facade.ts';
import { executeSdkProgram, executeInspectionProgram } from './program.ts';
import { authorDocument, type PreparedDocument } from './documents.ts';

export async function inspectUnit(api: FUniver, file: OfficeFile) {
  const kinds = {
    sheet: 'workbook',
    doc: 'document',
    slide: 'presentation',
    base: 'base',
    board: 'board',
  } as const;
  const overview = await inspectContent(
    {
      unitId: file.unitId,
      unitType: file.type,
      execute: async ({ code }) => ({
        value: (await executeInspectionProgram(api, code)) as never,
      }),
    },
    { kind: kinds[file.type] } as ContentInspectionQuery,
  );
  if (file.type === 'sheet')
    return {
      ...overview,
      samples: api
        .getWorkbook(file.unitId)!
        .getSheets()
        .slice(0, 3)
        .map((sheet) => ({
          sheetId: sheet.getSheetId(),
          range: 'A1:H12',
          cellData: sheet.getRange('A1:H12').getCellDatas(),
        })),
    };
  if (file.type === 'base')
    return {
      ...overview,
      samples: api
        .getBase(file.unitId)!
        .getTables()
        .slice(0, 5)
        .map((table) => ({
          tableId: table.getId(),
          records: table
            .getRecords()
            .slice(0, 20)
            .map((record) => ({ id: record.getId(), values: record.getValues() })),
        })),
    };
  return overview;
}

export async function author(
  api: FUniver,
  file: OfficeFile,
  action: OfficeAction | CompiledSlideAction,
  documentState?: unknown,
  prepared?: PreparedDocument,
): Promise<OfficeResult> {
  const location = { fileId: file.id, type: file.type, label: file.name };
  if (action.kind === 'inspect')
    return { summary: 'Read native Unit structure', content: await inspectUnit(api, file) };
  if (
    action.kind === 'script.read' ||
    action.kind === 'script.write' ||
    action.kind === 'script.verify'
  ) {
    const mode =
      action.kind === 'script.write'
        ? 'write'
        : action.kind === 'script.verify'
          ? 'verify'
          : 'read';
    return {
      summary: `${mode === 'write' ? 'Updated' : mode === 'verify' ? 'Checked' : 'Read'} ${file.name}`,
      content: await executeFacadeScript(api, file, action.code, mode),
      location,
      checked: mode === 'verify',
    };
  }
  if (action.kind === 'facade.read' || action.kind === 'facade.write') {
    return {
      summary: `${action.kind === 'facade.read' ? 'Read' : 'Edited'} ${file.name} through native Facade`,
      content: await executeFacadePlan(api, file, action),
      location,
    };
  }
  if (
    action.kind === 'doc.markdown' ||
    action.kind === 'doc.markdown.read' ||
    action.kind === 'doc.typst'
  )
    return authorDocument(api, file, action, documentState, prepared);
  if (action.kind === 'slide.compiled') {
    await executeSdkProgram(api, file, action.program);
    const page = api.getPresentation(file.unitId)?.getSlideByIndex(action.page - 1);
    if (!page) throw new Error('The generated slide could not be read back.');
    return {
      summary: `Compiled SVG into editable slide ${action.page}`,
      content: action.diagnostics,
      location: { ...location, pageId: page.getId() },
    };
  }
  if (action.kind === 'slide.svg') {
    throw new Error('SVG source must be compiled by the browser-measured Office gateway.');
  }
  return applyAction(api, file, action);
}
