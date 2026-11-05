import { z } from 'zod';
import {
  documentFlavorSchema,
  fileTypeSchema,
  type FileType,
  type OfficeFile,
} from '@univer-copilot/shared';
import { AppError } from '../http/errors.ts';
import type { OfficeImport } from './contracts.ts';

const nativeFile = z.object({
  format: z.literal('univer-office-copilot'),
  version: z.literal(1),
  type: fileTypeSchema,
  name: z.string().trim().min(1).max(100),
  documentFlavor: documentFlavorSchema.optional(),
  data: z.record(z.string(), z.unknown()),
  documentState: z.unknown().optional(),
});
const record = z.record(z.string(), z.unknown());
const shapes = {
  sheet: z.object({ sheetOrder: z.array(z.string()).min(1), sheets: record }),
  doc: z.object({ body: z.object({ dataStream: z.string() }), documentStyle: record }),
  slide: z.object({ slideOrder: z.array(z.string()), slides: record }),
  base: z.object({ tableOrder: z.array(z.string()), tables: record }),
  board: z.object({ pageOrder: z.array(z.string()), pages: record }),
};

/** Plugin resources serialize their own Unit references separately from the snapshot root. */
export function rebaseUnitData(data: Record<string, unknown>, unitId: string) {
  const sourceId = data.id;
  let copy: Record<string, unknown>;
  try {
    copy = structuredClone(data);
  } catch {
    throw new AppError(422, 'INVALID_SNAPSHOT', 'This native file could not be copied.');
  }
  function visit(value: unknown, depth = 0) {
    if (depth > 128)
      throw new AppError(422, 'INVALID_SNAPSHOT', 'This native file is nested too deeply.');
    if (!value || typeof value !== 'object') return;
    const fields = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(fields)) {
      if (
        typeof sourceId === 'string' &&
        (key === 'unitId' || key === 'unitID') &&
        child === sourceId
      )
        fields[key] = unitId;
      else visit(child, depth + 1);
    }
  }
  visit(copy);
  if (Array.isArray(copy.resources))
    for (const resource of copy.resources) {
      if (typeof resource?.data !== 'string') continue;
      let value: unknown;
      try {
        value = JSON.parse(resource.data);
      } catch {
        continue;
      }
      visit(value);
      resource.data = JSON.stringify(value);
    }
  copy.id = unitId;
  return copy;
}

export async function importOfficeFile(
  bytes: Uint8Array,
  filename: string,
  target?: FileType,
): Promise<OfficeImport> {
  try {
    if (/\.univer\.json$/i.test(filename)) {
      const value = nativeFile.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));
      shapes[value.type].parse(value.data);
      if (value.documentState !== undefined) {
        if (value.type !== 'doc') throw new Error('Only Docs contain authoring maps.');
        const { parseDocumentState } = await import('./authoring/documents.ts');
        value.documentState = parseDocumentState(value.documentState);
      }
      return value;
    }
    const extension = filename.split('.').at(-1)?.toLowerCase();
    const grid = ['xlsx', 'xls', 'csv', 'tsv'].includes(extension ?? '');
    const type = grid
      ? (target ?? 'sheet')
      : extension === 'docx'
        ? 'doc'
        : extension === 'pptx'
          ? 'slide'
          : undefined;
    if (
      !type ||
      (grid && type !== 'sheet' && type !== 'base') ||
      (!grid && target && target !== type)
    )
      throw new AppError(
        400,
        'UNSUPPORTED_FILE',
        'Choose an XLSX, XLS, CSV, TSV, DOCX, PPTX or .univer.json file.',
      );
    const exchange = await import('@univerjs-pro/exchange-node');
    const options =
      type === 'doc'
        ? { type: 1 as const, compatibilityMode: exchange.DocxCompatibilityMode.TRADITIONAL }
        : type === 'slide'
          ? { type: 3 as const }
          : type === 'base'
            ? { type: 5 as const, maxCells: 1_000_000 }
            : { type: 2 as const };
    const data = await exchange.importBuffer(Buffer.from(bytes), {
      ...options,
      fileName: filename,
    });
    shapes[type].parse(data);
    return {
      type,
      name:
        filename
          .replace(/\.[^.]+$/, '')
          .trim()
          .slice(0, 100) || 'Imported file',
      data: data as unknown as Record<string, unknown>,
      ...(type === 'doc' ? { documentFlavor: 'traditional' as const } : {}),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      'IMPORT_FAILED',
      'This file could not be imported. Check that its contents match the selected format.',
    );
  }
}

export function nativeOfficeFile(
  file: OfficeFile,
  data: Record<string, unknown>,
  documentState?: unknown,
) {
  return Buffer.from(
    JSON.stringify({
      format: 'univer-office-copilot',
      version: 1,
      type: file.type,
      name: file.name,
      ...(file.type === 'doc' ? { documentFlavor: file.documentFlavor ?? 'modern' } : {}),
      data,
      documentState,
    }),
  );
}

export async function exportOfficeBuffer(
  snapshot: Parameters<typeof import('@univerjs-pro/exchange-node').exportSnapshotToBuffer>[0],
  type: Exclude<FileType, 'board'>,
) {
  const exchange = await import('@univerjs-pro/exchange-node');
  const format =
    type === 'doc'
      ? exchange.ExchangeFormat.DOCX
      : type === 'slide'
        ? exchange.ExchangeFormat.PPTX
        : exchange.ExchangeFormat.XLSX;
  const options: import('@univerjs-pro/exchange-node').ExportOptions =
    type === 'doc'
      ? { type: 1 as const, format: exchange.ExchangeFormat.DOCX }
      : type === 'slide'
        ? { type: 3 as const, format: exchange.ExchangeFormat.PPTX }
        : type === 'base'
          ? { type: 5 as const, format: exchange.ExchangeFormat.XLSX }
          : { type: 2 as const, format: exchange.ExchangeFormat.XLSX };
  try {
    return {
      bytes: await exchange.exportSnapshotToBuffer(snapshot, options),
      extension: format,
      contentType:
        type === 'doc'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : type === 'slide'
            ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  } catch (error) {
    const code = error instanceof exchange.ExchangeError ? error.code : 'CONVERSION_FAILED';
    throw new AppError(
      422,
      code,
      code === 'LICENSE_EXPORT_QUOTA_EXCEEDED'
        ? 'The Office export quota has been reached. You can still download a Univer JSON file.'
        : code.startsWith('LICENSE_')
          ? 'Office export is unavailable with this server license. You can still download a Univer JSON file.'
          : 'This file could not be converted. Try downloading a Univer JSON file instead.',
    );
  }
}
