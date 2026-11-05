import type { AppDatabase } from '../../db/index.ts';
import type { OfficeFile } from '@univer-copilot/shared';

export function generatedSource(db: AppDatabase, file: OfficeFile, actor: string, page = 1) {
  const kind =
    file.type === 'slide'
      ? 'slide.svg'
      : file.type === 'doc'
        ? file.documentFlavor === 'traditional'
          ? 'doc.typst'
          : 'doc.markdown'
        : null;
  const notice =
    'Original generated source; native/manual edits may be newer. Inspect and preserve current content before replacing.';
  if (!kind) return { source: null, notice: 'This product uses native Facade authoring.' };
  const row = db
    .prepare(
      "SELECT result_json,created_at FROM operations WHERE owner_id=? AND file_id=? AND status='confirmed' AND json_extract(result_json,'$.action.kind')=? AND (? IS NULL OR json_extract(result_json,'$.action.page')=?) ORDER BY created_at DESC LIMIT 1",
    )
    .get(actor, file.id, kind, file.type === 'slide' ? page : null, page) as
    | { result_json: string; created_at: number }
    | undefined;
  if (!row)
    return {
      source: null,
      notice: 'No confirmed generation source is available for this user and target.',
    };
  const { action } = JSON.parse(row.result_json) as {
    action: { svg?: string; markdown?: string; page?: number; pages?: string[]; prelude?: string };
  };
  return {
    format: file.type === 'slide' ? 'svg' : kind === 'doc.typst' ? 'typst' : 'markdown',
    source: action.svg ?? action.markdown ?? { pages: action.pages, prelude: action.prelude },
    page: action.page,
    generatedAt: row.created_at,
    notice,
  };
}
