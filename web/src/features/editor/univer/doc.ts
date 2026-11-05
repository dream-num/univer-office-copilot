import { type Univer, LocaleService, LocaleType } from '@univerjs/core';
import { UniverDocsHistoryPlugin } from '@univerjs-pro/docs-history';
import { UniverDocsHistoryUIPlugin } from '@univerjs-pro/docs-history-ui';
import HistoryEnUS from '@univerjs-pro/docs-history-ui/locale/en-US';
import { DocHistoryLifecyclePlugin } from './doc-history-lifecycle.ts';
import { mergeLocales } from '@univerjs/presets';
import { UniverDocsFindReplacePlugin } from '@univerjs/docs-find-replace';
import FindReplaceEnUS from '@univerjs/find-replace/locale/en-US';
import '@univerjs/find-replace/lib/index.css';
import { presetHost, type HostConfig } from './common.ts';
import '@univerjs/docs/facade';
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core';
import CoreEnUS from '@univerjs/preset-docs-core/locales/en-US';
import '@univerjs/preset-docs-core/lib/index.css';
import { UniverDocsDrawingPreset } from '@univerjs/preset-docs-drawing';
import DrawingEnUS from '@univerjs/preset-docs-drawing/locales/en-US';
import '@univerjs/preset-docs-drawing/lib/index.css';
import { UniverDocsHyperLinkPreset } from '@univerjs/preset-docs-hyper-link';
import HyperLinkEnUS from '@univerjs/preset-docs-hyper-link/locales/en-US';
import '@univerjs/preset-docs-hyper-link/lib/index.css';
import { UniverDocsThreadCommentPreset } from '@univerjs/preset-docs-thread-comment';
import ThreadCommentEnUS from '@univerjs/preset-docs-thread-comment/locales/en-US';
import '@univerjs/preset-docs-thread-comment/lib/index.css';
import { UniverDocsAdvancedPreset } from '@univerjs/preset-docs-advanced';
import AdvancedEnUS from '@univerjs/preset-docs-advanced/locales/en-US';
import '@univerjs/preset-docs-advanced/lib/index.css';
import { UniverDocsCalloutPlugin } from '@univerjs-pro/docs-callout';
import { UniverDocsCalloutUIPlugin } from '@univerjs-pro/docs-callout-ui';
import CalloutUIEnUS from '@univerjs-pro/docs-callout-ui/locale/en-US';
import '@univerjs-pro/docs-callout/facade';
import '@univerjs-pro/docs-callout-ui/lib/index.css';
import { UniverDocsChartPlugin } from '@univerjs-pro/docs-chart';
import { UniverDocsChartUIPlugin } from '@univerjs-pro/docs-chart-ui';
import ChartUIEnUS from '@univerjs-pro/docs-chart-ui/locale/en-US';
import '@univerjs-pro/docs-chart/facade';
import '@univerjs-pro/docs-chart-ui/lib/index.css';
import { UniverDocsCodePlugin } from '@univerjs-pro/docs-code';
import { UniverDocsCodeUIPlugin } from '@univerjs-pro/docs-code-ui';
import CodeUIEnUS from '@univerjs-pro/docs-code-ui/locale/en-US';
import '@univerjs-pro/docs-code/facade';
import '@univerjs-pro/docs-code-ui/lib/index.css';
import { UniverDocsColumnPlugin } from '@univerjs-pro/docs-column';
import { UniverDocsColumnUIPlugin } from '@univerjs-pro/docs-column-ui';
import ColumnUIEnUS from '@univerjs-pro/docs-column-ui/locale/en-US';
import '@univerjs-pro/docs-column/facade';
import '@univerjs-pro/docs-column-ui/lib/index.css';
import { UniverDocsLatexPlugin } from '@univerjs-pro/docs-latex';
import { UniverDocsLatexUIPlugin } from '@univerjs-pro/docs-latex-ui';
import LatexUIEnUS from '@univerjs-pro/docs-latex-ui/locale/en-US';
import '@univerjs-pro/docs-latex/facade';
import '@univerjs-pro/docs-latex-ui/lib/index.css';
import { UniverDocsListPlugin } from '@univerjs-pro/docs-list';
import { UniverDocsListUIPlugin } from '@univerjs-pro/docs-list-ui';
import ListUIEnUS from '@univerjs-pro/docs-list-ui/locale/en-US';
import '@univerjs-pro/docs-list/facade';
import '@univerjs-pro/docs-list-ui/lib/index.css';
import { UniverDocsQuotePlugin } from '@univerjs-pro/docs-quote';
import { UniverDocsQuoteUIPlugin } from '@univerjs-pro/docs-quote-ui';
import QuoteUIEnUS from '@univerjs-pro/docs-quote-ui/locale/en-US';
import '@univerjs-pro/docs-quote/facade';
import '@univerjs-pro/docs-quote-ui/lib/index.css';
import { UniverDocsShapePlugin } from '@univerjs-pro/docs-shape';
import { UniverDocsShapeUIPlugin } from '@univerjs-pro/docs-shape-ui';
import ShapeUIEnUS from '@univerjs-pro/docs-shape-ui/locale/en-US';
import '@univerjs-pro/docs-shape/facade';
import '@univerjs-pro/docs-shape-ui/lib/index.css';
import { UniverDocsTablePlugin } from '@univerjs-pro/docs-table';
import { UniverDocsTableUIPlugin } from '@univerjs-pro/docs-table-ui';
import TableUIEnUS from '@univerjs-pro/docs-table-ui/locale/en-US';
import '@univerjs-pro/docs-table/facade';
import '@univerjs-pro/docs-table-ui/lib/index.css';
import SharedChartUIEnUS from '@univerjs-pro/chart-ui/locale/en-US';
import EngineChartEnUS from '@univerjs-pro/engine-chart/locale/en-US';
import ShapeEditorUIEnUS from '@univerjs-pro/shape-editor-ui/locale/en-US';
import '@univerjs-pro/chart-ui/facade';
import '@univerjs-pro/engine-chart/facade';
import '@univerjs-pro/chart-ui/lib/index.css';
import '@univerjs-pro/shape-editor-ui/lib/index.css';
export function createHost(config: HostConfig) {
  return presetHost(
    config,
    mergeLocales(
      CoreEnUS,
      DrawingEnUS,
      HyperLinkEnUS,
      ThreadCommentEnUS,
      AdvancedEnUS,
      CalloutUIEnUS,
      ChartUIEnUS,
      CodeUIEnUS,
      ColumnUIEnUS,
      LatexUIEnUS,
      ListUIEnUS,
      QuoteUIEnUS,
      ShapeUIEnUS,
      TableUIEnUS,
      FindReplaceEnUS,
      SharedChartUIEnUS,
      EngineChartEnUS,
      ShapeEditorUIEnUS,
    ),
    UniverDocsCorePreset({ container: config.container, ribbonType: 'grid' }),
    [
      UniverDocsDrawingPreset(),
      UniverDocsHyperLinkPreset(),
      UniverDocsThreadCommentPreset(),
      UniverDocsAdvancedPreset({ license: config.license, universerEndpoint: location.origin }),
      {
        plugins: [
          UniverDocsFindReplacePlugin,
          UniverDocsCalloutPlugin,
          UniverDocsCalloutUIPlugin,
          UniverDocsChartPlugin,
          UniverDocsChartUIPlugin,
          UniverDocsCodePlugin,
          UniverDocsCodeUIPlugin,
          UniverDocsColumnPlugin,
          UniverDocsColumnUIPlugin,
          UniverDocsLatexPlugin,
          UniverDocsLatexUIPlugin,
          UniverDocsListPlugin,
          UniverDocsListUIPlugin,
          UniverDocsQuotePlugin,
          UniverDocsQuoteUIPlugin,
          UniverDocsShapePlugin,
          UniverDocsShapeUIPlugin,
          UniverDocsTablePlugin,
          UniverDocsTableUIPlugin,
        ],
      },
    ],
  );
}

export function registerHistory(
  univer: Univer,
  containerId: string,
  historyServerUrl: string,
  restore: (revision: number) => Promise<void>,
) {
  univer
    .__getInjector()
    .get(LocaleService)
    .load({ [LocaleType.EN_US]: HistoryEnUS });
  univer.registerPlugin(UniverDocsHistoryPlugin);
  univer.registerPlugin(UniverDocsHistoryUIPlugin, {
    univerContainerId: containerId,
    historyServerUrl,
    viewerPlugins: [[DocHistoryLifecyclePlugin, { restore }]],
  });
}
