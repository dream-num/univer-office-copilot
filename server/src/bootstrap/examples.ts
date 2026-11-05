import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FilesService } from '../modules/files/index.ts';

export const demoExamples = [
  { filename: 'financial-analysis.univer.json' },
  { filename: 'investor-presentation.univer.json' },
  { filename: 'financial-due-diligence.univer.json' },
  { filename: 'financial-decision-map.univer.json' },
  { filename: 'investment-committee-memo.univer.json' },
  { filename: 'financial-model.univer.json' },
] as const;

/** Give each new local demo account its own editable copies, without importing history. */
export async function seedDemoExamples(files: FilesService, actorId: string) {
  for (const entry of demoExamples) {
    const bytes = await readFile(resolve('examples', entry.filename));
    await files.importFile(actorId, bytes, entry.filename);
  }
}
