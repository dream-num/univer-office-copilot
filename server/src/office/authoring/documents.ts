import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compileDocMarkdown,
  compileDocMarkdownUpdate,
  compileDocMarkdownRead,
  parseDocMarkdownSourceMap,
  parseDocMarkdownReadResult,
  resolveDocMarkdownReadAssets,
  type DocMarkdownSourceMapEntry,
} from '@univer-cli/doc-markdown-facade';
import { registerDocMarkdownRuntime } from '@univer-cli/doc-markdown-facade/runtime';
import { materializeDocProgram } from '@univer-cli/doc-markdown-facade/node';
import { createStandardHeadlessUniverFactory } from '@univer-cli/headless-univer';
import { compileDocTypstBundle, DaCTypstTranslationError } from '@univer-cli/doc-typst-facade';
import {
  DocumentFlavor,
  getDocsEmptySnapshot,
  JSONX,
  LocaleType,
  type IDocumentData,
  type JSONXActions,
} from '@univerjs/core';
import { RichTextEditingMutation } from '@univerjs/docs';
import type { FUniver } from '@univerjs/core/facade';
import type { OfficeAction, OfficeFile } from '@univer-copilot/shared';
import type { OfficeResult } from '../contracts.ts';
import { executeInspectionProgram } from './program.ts';

type Action = Extract<OfficeAction, { kind: 'doc.markdown' | 'doc.markdown.read' | 'doc.typst' }>;
type Assets = NonNullable<Extract<Action, { kind: 'doc.markdown' }>['assets']>;
export type DocumentState = { sourceMap: readonly DocMarkdownSourceMapEntry[]; assets: Assets };

export function parseDocumentState(value: unknown): DocumentState {
  const state = value as DocumentState | undefined;
  validateAssets(state?.assets ?? {});
  return {
    sourceMap: state ? parseDocMarkdownSourceMap(state.sourceMap) : [],
    assets: state?.assets ?? {},
  };
}

function assetBytes(asset: Assets[string]): Buffer {
  const uri = /^data:image\/[a-zA-Z0-9.+-]+;base64,([\s\S]+)$/.exec(asset.data);
  const bytes = Buffer.from(
    uri?.[1] ?? asset.data,
    uri || asset.encoding === 'base64' ? 'base64' : 'utf8',
  );
  if (bytes.length > 1024 * 1024) throw new Error('Each document asset must be at most 1 MiB.');
  return bytes;
}
function validateAssets(assets: Assets) {
  if (Object.keys(assets).length > 20) throw new Error('Use at most 20 document assets.');
  let total = 0;
  for (const [path, asset] of Object.entries(assets)) {
    if (
      !/^assets\/[a-zA-Z0-9_./-]+$/.test(path) ||
      path.split('/').some((p) => !p || p === '.' || p === '..')
    )
      throw new Error('Document assets require safe relative paths under assets/.');
    total += assetBytes(asset).length;
  }
  if (total > 4 * 1024 * 1024) throw new Error('Document assets exceed 4 MiB.');
}

/** Reset only content through the SDK OT mutation; file identity, ACL and history stay intact. */
async function resetDocument(
  api: FUniver,
  file: OfficeFile,
  style: IDocumentData['documentStyle'],
) {
  const document = api.getDocument(file.unitId)!;
  // Remove resource-backed native objects before resetting their anchors.
  for (const object of [...document.getCharts(), ...document.getShapes(), ...document.getImages()])
    await object.remove();
  const current = document.save();
  const empty = getDocsEmptySnapshot(
    file.unitId,
    LocaleType.EN_US,
    file.name,
    style?.documentFlavor ?? DocumentFlavor.MODERN,
  );
  const next = { ...empty, documentStyle: style };
  const json = JSONX.getInstance();
  let actions: JSONXActions = null;
  for (const key of [
    'body',
    'documentStyle',
    'tableSource',
    'drawings',
    'drawingsOrder',
    'headers',
    'footers',
    'lists',
    'notes',
    'noteSettings',
  ] as const) {
    const oldValue = current[key],
      newValue = next[key];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    const operation =
      oldValue === undefined
        ? json.insertOp([key], newValue)
        : newValue === undefined
          ? json.removeOp([key], oldValue)
          : json.replaceOp([key], oldValue, newValue);
    actions = JSONX.compose(actions, operation);
  }
  if (
    actions &&
    !(await api.executeCommand(RichTextEditingMutation.id, {
      unitId: file.unitId,
      actions,
      textRanges: [],
      noNeedSetTextRange: true,
    }))
  )
    throw new Error('The document content reset was rejected.');
}

export type PreparedDocument = {
  javascript: string;
  style: IDocumentData['documentStyle'];
  diagnostics: readonly unknown[];
};

async function createInCurrentDocument(api: FUniver, file: OfficeFile, prepared: PreparedDocument) {
  const { javascript } = prepared;
  await resetDocument(api, file, prepared.style);
  // Confirm the reset before compiler edits can mutate JSONX values shared with the new body.
  await api.getCollaboration().flush(file.unitId, { timeout: 15000 });
  let created = false;
  const controlled = new Proxy(api, {
    get(target, property) {
      if (property === 'getDocument')
        return (id: string) => {
          if (id !== file.unitId) throw new Error('The compiler requested another document.');
          return created ? target.getDocument(id) : null;
        };
      if (property === 'createDocument')
        return (data: IDocumentData) => {
          if (created || data.id !== file.unitId)
            throw new Error('The compiler must target exactly the current document.');
          created = true;
          return target.getDocument(file.unitId);
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const result = await executeInspectionProgram(controlled, javascript);
  if (!created) throw new Error('The compiler did not author the current document.');
  // Header creation JSONX values share their body with subsequent SDK edits in 1.3.1.
  // Persist the finished native segments so replay cannot insert their text twice.
  const snapshot = api.getDocument(file.unitId)!.save();
  let segments: JSONXActions = null;
  for (const key of ['headers', 'footers'] as const) {
    const value = snapshot[key];
    if (value && Object.keys(value).length)
      segments = JSONX.compose(
        segments,
        JSONX.getInstance().replaceOp([key], value, structuredClone(value)),
      );
  }
  if (
    segments &&
    !(await api.executeCommand(RichTextEditingMutation.id, {
      unitId: file.unitId,
      actions: segments,
      textRanges: [],
      noNeedSetTextRange: true,
    }))
  )
    throw new Error('The native header/footer checkpoint was rejected.');
  return result;
}

export async function prepareDocument(
  file: OfficeFile,
  action: { kind: string },
  previous?: unknown,
): Promise<PreparedDocument | undefined> {
  const candidate = action as Action;
  async function validate(javascript: string, diagnostics: readonly unknown[]) {
    const materialized = await materializeDocProgram(
      { javascript, targetUnitId: file.unitId },
      {
        createUniver: createStandardHeadlessUniverFactory({
          license: process.env.UNIVER_CLIENT_LICENSE ?? '',
        }),
      },
    );
    return { javascript, diagnostics, style: materialized.data.documentStyle };
  }
  if (candidate.kind === 'doc.typst') {
    // In SDK 1.3.1 this setting leaks as text, or terminates the native worker at EOF.
    if (
      [candidate.prelude ?? '', ...candidate.pages].some((source) =>
        /^\s*#set\s+list\s*\(/m.test(source),
      )
    )
      throw new Error(
        'The Typst SDK does not support #set list. Remove that setting and use native list defaults with + or - items.',
      );
    const assets = candidate.assets ?? {};
    validateAssets(assets);
    const directory = await mkdtemp(join(tmpdir(), 'copilot-typst-'));
    try {
      await mkdir(join(directory, 'pages'));
      await mkdir(join(directory, 'assets'));
      const pages = candidate.pages.map((_, index) => `pages/${index + 1}.typ`);
      for (const [index, source] of candidate.pages.entries())
        await writeFile(join(directory, pages[index]!), source);
      for (const [path, asset] of Object.entries(assets)) {
        await mkdir(join(directory, path, '..'), { recursive: true });
        await writeFile(join(directory, path), assetBytes(asset));
      }
      if (candidate.prelude) await writeFile(join(directory, 'prelude.typ'), candidate.prelude);
      await writeFile(
        join(directory, 'typst.json'),
        JSON.stringify({
          schemaVersion: 1,
          targetUnitId: file.unitId,
          title: file.name,
          pages,
          ...(candidate.prelude ? { prelude: ['prelude.typ'] } : {}),
        }),
      );
      const compiled = await compileDocTypstBundle(directory).catch((error: unknown) => {
        if (error instanceof DaCTypstTranslationError)
          throw new Error(
            JSON.stringify({
              message: error.message,
              diagnostics: error.diagnostics.slice(0, 20),
            }).slice(0, 12000),
          );
        throw error;
      });
      if (compiled.diagnostics.some((d) => d.severity === 'error'))
        throw new Error(JSON.stringify(compiled.diagnostics));
      return validate(compiled.javascript, compiled.diagnostics);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  if (candidate.kind === 'doc.markdown' && candidate.mode === 'replace' && !candidate.blockIds) {
    const assets = { ...parseDocumentState(previous).assets, ...candidate.assets };
    validateAssets(assets);
    const compiled = await compileDocMarkdown(candidate.markdown, {
      targetUnitId: file.unitId,
      title: file.name,
      assetResolver: async (reference) => {
        const asset = assets[reference];
        if (!asset) throw new Error(`Provide the local asset ${reference}.`);
        return {
          data: asset.data.startsWith('data:image/') ? asset.data : assetBytes(asset),
          mimeType: asset.mimeType,
        };
      },
    });
    return validate(compiled.javascript, compiled.diagnostics);
  }
}

export async function authorDocument(
  api: FUniver,
  file: OfficeFile,
  action: Action,
  previous?: unknown,
  prepared?: PreparedDocument,
): Promise<OfficeResult> {
  if (file.type !== 'doc') throw new Error('Document authoring requires a Doc.');
  registerDocMarkdownRuntime(api);
  const document = api.getDocument(file.unitId)!;
  const state = parseDocumentState(previous);
  const location = { fileId: file.id, type: file.type, label: file.name };
  if (action.kind === 'doc.typst') {
    if (!document.isTraditional())
      throw new Error('Typst requires a Paged document. Create a Paged document from New file.');
    if (!prepared) throw new Error('The Typst program was not validated.');
    await createInCurrentDocument(api, file, prepared);
    return {
      summary: 'Generated a native Paged document from Typst',
      content: { diagnostics: prepared.diagnostics, sourcePages: action.pages.length },
      documentState: null,
      location,
    };
  }
  if (!document.isModern())
    throw new Error(
      'Markdown authoring requires a Modern document. Use Typst or native Facade edits for Paged documents.',
    );
  if (action.kind === 'doc.markdown.read') {
    if (!state.sourceMap.length)
      throw new Error(
        'No Markdown block mapping is available. Use native Facade reads for this document.',
      );
    const blockIds =
      action.blockIds ??
      state.sourceMap.filter((entry) => !entry.parentId).map((entry) => entry.id);
    const program = compileDocMarkdownRead({
      targetUnitId: file.unitId,
      sourceMap: state.sourceMap,
      blockIds,
    });
    const current = parseDocMarkdownReadResult(
      await executeInspectionProgram(api, program.javascript),
    );
    const resolved = await resolveDocMarkdownReadAssets(current, {
      assetResolver: async (reference) => {
        if (!reference.startsWith('data:image/'))
          throw new Error(
            'This image needs an authenticated asset service; the local sample supports inline images.',
          );
        return { data: reference };
      },
    });
    if (resolved.diagnostics.some((d) => d.severity === 'error'))
      throw new Error(JSON.stringify(resolved.diagnostics));
    const assets = { ...state.assets };
    for (const asset of resolved.assets)
      assets[asset.path] = {
        data: asset.data,
        encoding: asset.encoding === 'base64' ? 'base64' : 'utf8',
        mimeType: asset.mimeType,
      };
    return {
      summary: 'Read current native Markdown blocks',
      content: {
        ...resolved,
        assets: resolved.assets.map((asset) =>
          asset.encoding === 'base64'
            ? { ...asset, data: '[image bytes retained by the application]' }
            : asset,
        ),
        revision: document.save().rev,
      },
      documentState: { sourceMap: resolved.sourceMap, assets },
      location,
      checked: true,
    };
  }
  const assets = { ...state.assets, ...action.assets };
  const existingIds = new Set(document.save().body?.paragraphs?.map((p) => p.paragraphId));
  validateAssets(assets);
  const options = {
    targetUnitId: file.unitId,
    title: file.name,
    assetResolver: async (reference: string) => {
      const asset = assets[reference];
      if (!asset)
        throw new Error(`Provide the local asset ${reference} in the action's assets object.`);
      return {
        data: asset.data.startsWith('data:image/') ? asset.data : assetBytes(asset),
        mimeType: asset.mimeType,
      };
    },
  };
  let compiled, value;
  if (action.blockIds) {
    if (!state.sourceMap.length)
      throw new Error('Read generated native blocks before a Markdown update.');
    compiled = await compileDocMarkdownUpdate(action.markdown, {
      ...options,
      sourceMap: state.sourceMap,
      blockIds: action.blockIds,
    });
    value = await executeInspectionProgram(api, compiled.javascript);
  } else if (action.mode === 'append') {
    const id = `append-${randomUUID()}`;
    const source = `::::::block{#${id}}\n\n${action.markdown}\n\n::::::`;
    const parsed = await compileDocMarkdown(source, options);
    const placeholder = document.appendParagraph('');
    const root = parsed.sourceMap.find((entry) => entry.id === id)!;
    try {
      compiled = await compileDocMarkdownUpdate(source, {
        ...options,
        sourceMap: [
          ...state.sourceMap,
          { ...root, paragraphIds: [placeholder.getId()], objectIds: [] },
        ],
        blockIds: [id],
      });
      value = await executeInspectionProgram(api, compiled.javascript);
    } catch (error) {
      if (!placeholder.getText()) placeholder.remove();
      throw error;
    }
  } else {
    if (!prepared) throw new Error('The Markdown program was not validated.');
    compiled = prepared;
    value = await createInCurrentDocument(api, file, prepared);
  }
  const sourceMap = parseDocMarkdownSourceMap(value);
  if (action.blockIds || action.mode === 'append') {
    // SDK 1.3.1 regenerates split paragraph IDs while replaying TextX remotely.
    // Checkpoint the compiler's actual IDs through OT before retaining its source map.
    const ids = new Set(sourceMap.flatMap((entry) => entry.paragraphIds));
    let actions: JSONXActions = null;
    for (const [index, paragraph] of (document.save().body?.paragraphs ?? []).entries()) {
      if (
        !paragraph.paragraphId ||
        !ids.has(paragraph.paragraphId) ||
        existingIds.has(paragraph.paragraphId)
      )
        continue;
      actions = JSONX.compose(
        actions,
        JSONX.getInstance().replaceOp(
          ['body', 'paragraphs', index, 'paragraphId'],
          paragraph.paragraphId,
          paragraph.paragraphId,
        ),
      );
    }
    if (
      actions &&
      !(await api.executeCommand(RichTextEditingMutation.id, {
        unitId: file.unitId,
        actions,
        textRanges: [],
        noNeedSetTextRange: true,
      }))
    )
      throw new Error('The Markdown block identity checkpoint was rejected.');
  }
  return {
    summary: 'Authored native Modern document content with the Markdown SDK',
    content: {
      diagnostics: compiled.diagnostics,
      blockIds: sourceMap.filter((entry) => !entry.parentId).map((entry) => entry.id),
    },
    documentState: { sourceMap, assets },
    location,
  };
}
