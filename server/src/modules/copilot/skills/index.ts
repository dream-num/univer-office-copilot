import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import type { FileType, DocumentFlavor } from '@univer-copilot/shared';

const root = import.meta.url.endsWith('.ts')
  ? fileURLToPath(new URL('.', import.meta.url))
  : resolve('server/dist/skills');
export const skillResources = [
  'workspace-markdown.md',
  'doc-typst.md',
  'workspace-sheet.md',
  'workspace-slide.md',
  'workspace-base.md',
  'board/board-spec.md',
  'board/flow-state.md',
  'board/sequence.md',
  'board/class-er.md',
  'board/uml-structure.md',
  'board/mind-map.md',
  'board/content-selection.md',
  'board/connector-routing.md',
  'board/connector-labels.md',
  'board/diagram-review.md',
] as const;
const resources = new Set<string>(skillResources);
export async function readOfficeSkill(product: FileType, resource?: string): Promise<string> {
  if (resource && !resources.has(resource)) throw new Error('Unknown bundled skill reference.');
  return readFile(
    resource ? join(root, 'references', resource) : join(root, `${product}.md`),
    'utf8',
  );
}
export async function officeInstructions(
  product: FileType,
  flavor?: DocumentFlavor | null,
): Promise<string> {
  const reference =
    product === 'doc'
      ? flavor === 'traditional'
        ? 'doc-typst.md'
        : 'workspace-markdown.md'
      : product === 'board'
        ? 'board/board-spec.md'
        : `workspace-${product}.md`;
  return `${await readFile(join(root, 'core.md'), 'utf8')}\n\n${await readOfficeSkill(product)}\n\n${await readOfficeSkill(product, reference)}`;
}
