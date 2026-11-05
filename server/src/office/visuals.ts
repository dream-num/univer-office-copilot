import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { createStandardApiReference } from '@univer-cli/api-reference';
import { createNodeResourceLibraryFactory } from '@univer-cli/resource-library';
import {
  createUniverRenderRuntime,
  type UniverRenderUnit,
} from '@univer-cli/univer-render-runtime';
import { compileSvgToFacade, wrapSlideScript, type SvgTextMeasurer } from '@univer-cli/svg-facade';
import { createUnitScreenshot, type UnitScreenshotInput } from '@univer-cli/unit-screenshot';
import { createUnitLayoutLint } from '@univer-cli/unit-layout-lint';
import type { IDocumentData } from '@univerjs/core';
import type { OfficeFile, OfficeAction } from '@univer-copilot/shared';
import type { CompiledSlideAction, OfficeVisualTarget } from './contracts.ts';
import { officeEnvironment } from './environment.ts';

type Runtime = Awaited<ReturnType<typeof createUniverRenderRuntime>>;

export function createOfficeVisuals(
  dataDir: string,
  snapshot: (file: OfficeFile, actor: string) => Promise<Record<string, unknown>>,
) {
  let runtime: Promise<Runtime> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let reference: ReturnType<typeof createStandardApiReference> | undefined;
  const require = createRequire(import.meta.url);
  const resources = createNodeResourceLibraryFactory({
    manifestPath: require.resolve('@univerjs-pro/cli-assets/manifest.json'),
    cacheRoot: resolve(dataDir, 'resource-cache'),
  });
  function rendered<T>(operation: (runtime: Runtime) => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      runtime ??= createUniverRenderRuntime({
        env: officeEnvironment(),
        renderPageRoot: resolve('server/dist/render-page'),
        license: process.env.UNIVER_CLIENT_LICENSE?.trim(),
      });
      return operation(await runtime);
    });
    queue = result.catch(() => {});
    return result;
  }
  return {
    api(input: { symbols?: string[]; terms?: string[]; unit: OfficeFile['type'] }) {
      reference ??= createStandardApiReference();
      return input.symbols?.length
        ? reference.show(input.symbols)
        : reference.find({ terms: input.terms ?? [], unit: input.unit, limit: 8 });
    },
    async resources(input: {
      action: 'registries' | 'find' | 'read';
      queries?: string[];
      handle?: string;
    }) {
      const library = resources();
      if (input.action === 'registries') return library.listRegistries();
      if (input.action === 'find') return library.find({ queries: input.queries ?? [], limit: 6 });
      const asset = await library.read({ handle: input.handle ?? '' });
      return {
        ...asset,
        dataUri: `data:image/svg+xml;base64,${Buffer.from(asset.svg).toString('base64')}`,
      };
    },
    compile(action: Extract<OfficeAction, { kind: 'slide.svg' }>): Promise<CompiledSlideAction> {
      if (/(?:href|src)\s*=\s*["'](?!#|data:image\/)/i.test(action.svg))
        throw new Error(
          'SVG assets must use inline image data or local symbols. Use office_resources.',
        );
      return rendered(async (runtime) => {
        let measurements: Promise<unknown> = Promise.resolve();
        const measurer: SvgTextMeasurer = {
          source: 'univer-render-runtime',
          measureLine({ runs }) {
            const measured = measurements.then(async () => {
              let offset = 0;
              const textRuns = runs.map((run) => {
                const start = offset;
                offset += run.text.length;
                return {
                  st: start,
                  ed: offset,
                  ts: {
                    fs: run.fontSizePx * 0.75,
                    bl: run.bold ? 1 : 0,
                    it: run.italic ? 1 : 0,
                    ...(run.fontFamily ? { ff: run.fontFamily } : {}),
                  },
                };
              });
              const text = runs.map((run) => run.text).join('');
              const doc = {
                id: 'svg-measure',
                body: {
                  dataStream: `${text}\r\n`,
                  paragraphs: [{ paragraphId: 'measure', startIndex: text.length }],
                  textRuns,
                },
                documentStyle: {
                  marginTop: 0,
                  marginBottom: 0,
                  marginLeft: 0,
                  marginRight: 0,
                  pageSize: { width: 1000000, height: 1000000 },
                },
              } as IDocumentData;
              const metrics = await runtime.measureText({ doc });
              return {
                width: metrics.actualWidth,
                ascent: metrics.firstLineAscent,
                descent: metrics.firstLineDescent,
              };
            });
            measurements = measured.catch(() => {});
            return measured;
          },
        };
        const result = await compileSvgToFacade(action.svg, { textMeasurer: measurer });
        if (result.warnings.length)
          throw new Error(`Resolve SVG warnings before applying: ${result.warnings.join('; ')}`);
        return {
          kind: 'slide.compiled',
          page: action.page,
          program: wrapSlideScript(result.code, {
            page: action.page,
            mode: action.mode,
            ...result.viewport,
          }),
          diagnostics: {
            viewport: result.viewport,
            lints: result.lints,
            textMeasure: result.textMeasure,
          },
        };
      });
    },
    async visual(file: OfficeFile, actor: string, target: OfficeVisualTarget) {
      const unitData = await snapshot(file, actor);
      const unit = { unitType: file.type, unitData } as unknown as UniverRenderUnit;
      return rendered(async (runtime) => {
        if (target.kind === 'lint') {
          if (unit.unitType !== 'slide')
            throw new Error(
              'Layout lint requires a Slide. Board diagnostics are returned by its preview.',
            );
          return {
            report: await createUnitLayoutLint({ runtime }).lint({ ...unit, pages: target.pages }),
          };
        }
        const selection =
          file.type === 'slide'
            ? { kind: 'slide-pages', pages: target.pages ?? [1], scale: 1 }
            : file.type === 'doc'
              ? { kind: 'doc-pages', pages: target.pages, scale: 1 }
              : file.type === 'sheet'
                ? {
                    kind: 'sheet-range',
                    range: target.range ?? 'A1:J20',
                    sheetName: target.sheetName,
                    scale: 1,
                  }
                : file.type === 'board'
                  ? {
                      kind: 'board-content',
                      ...(target.region || target.elementIds?.length
                        ? {
                            region: target.region,
                            elementIds: target.elementIds,
                            padding: target.padding ?? 40,
                            scale: target.scale ?? 1,
                          }
                        : {}),
                    }
                  : { kind: 'base-view', scale: 1 };
        const captured = await createUnitScreenshot({
          runtime,
          limits: { maxPages: 8, maxPixels: 30000000 },
        }).capture({ ...unit, target: selection } as UnitScreenshotInput);
        const directory = resolve(dataDir, 'previews', file.unitId);
        await mkdir(directory, { recursive: true });
        const images = [];
        for (const image of captured.images) {
          const id = `${randomUUID()}.png`;
          await writeFile(join(directory, id), image.bytes);
          images.push({
            url: `/api/office/previews/${file.unitId}/${id}`,
            width: image.width,
            height: image.height,
            page: image.page,
            layoutAnalysis: image.layoutAnalysis,
          });
        }
        return { images };
      });
    },
    readImage(unitId: string, imageId: string) {
      if (!/^[a-zA-Z0-9-]+$/.test(unitId) || !/^[a-f0-9-]{36}\.png$/.test(imageId))
        throw new Error('Invalid preview identity.');
      return readFile(resolve(dataDir, 'previews', unitId, imageId));
    },
    async close() {
      await queue;
      await (await runtime)?.close();
    },
  };
}
