import { type Univer, LocaleService, LocaleType } from '@univerjs/core';
import { UniverSlidesHistoryPlugin } from '@univerjs-pro/slides-history';
import { UniverSlidesHistoryUIPlugin } from '@univerjs-pro/slides-history-ui';
import HistoryEnUS from '@univerjs-pro/slides-history-ui/locale/en-US';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import { UniverSlidesPlugin } from '@univerjs-pro/slides';
import { UniverSlidesUIPlugin } from '@univerjs-pro/slides-ui';
import { UniverShapePlugin } from '@univerjs-pro/engine-shape';
import { UniverShapeEditorPlugin } from '@univerjs-pro/shape-editor';
import { UniverShapeEditorUIPlugin } from '@univerjs-pro/shape-editor-ui';
import { UniverThreadCommentUIPlugin } from '@univerjs/thread-comment-ui';
import { UniverSlidesChartPlugin } from '@univerjs-pro/slides-chart';
import { UniverSlidesChartUIPlugin } from '@univerjs-pro/slides-chart-ui';
import { UniverSlidesTablePlugin } from '@univerjs-pro/slides-table';
import { UniverSlidesTableUIPlugin } from '@univerjs-pro/slides-table-ui';
import { UniverSlidesPrintPlugin } from '@univerjs-pro/slides-print';
import { UniverSlidesThreadCommentUIPlugin } from '@univerjs-pro/slides-thread-comment-ui';
import { mergeLocales } from '@univerjs/core';
import locale from '@univerjs-pro/slides-ui/locale/en-US';
import SlidesEnUS from '@univerjs-pro/slides/locale/en-US';
import ChartUIEnUS from '@univerjs-pro/chart-ui/locale/en-US';
import EngineChartEnUS from '@univerjs-pro/engine-chart/locale/en-US';
import SlidesChartEnUS from '@univerjs-pro/slides-chart-ui/locale/en-US';
import SlidesTableEnUS from '@univerjs-pro/slides-table-ui/locale/en-US';
import SlidesPrintEnUS from '@univerjs-pro/slides-print/locale/en-US';
import SlidesCommentsEnUS from '@univerjs-pro/slides-thread-comment-ui/locale/en-US';
import { finishHost, proHost, type HostConfig } from './common.ts';
import '@univerjs-pro/slides/facade';
import '@univerjs-pro/slides-chart/facade';
import '@univerjs-pro/slides-table/facade';
import '@univerjs-pro/slides-print/facade';
import '@univerjs-pro/chart-ui/facade';
import '@univerjs-pro/engine-chart/facade';
import '@univerjs-pro/chart-ui/lib/index.css';
import '@univerjs-pro/slides-chart-ui/lib/index.css';
import '@univerjs-pro/slides-table-ui/lib/index.css';
import '@univerjs-pro/slides-print/lib/index.css';
import '@univerjs-pro/slides-thread-comment-ui/lib/index.css';
import '@univerjs-pro/shape-editor-ui/lib/index.css';
import '@univerjs-pro/slides-ui/lib/index.css';
export function createHost(config: HostConfig) {
  const univer = proHost(
    config,
    mergeLocales(
      locale,
      SlidesEnUS,
      ChartUIEnUS,
      EngineChartEnUS,
      SlidesChartEnUS,
      SlidesTableEnUS,
      SlidesPrintEnUS,
      SlidesCommentsEnUS,
    ),
  );
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverShapePlugin);
  univer.registerPlugin(UniverShapeEditorPlugin);
  univer.registerPlugin(UniverShapeEditorUIPlugin);
  univer.registerPlugin(UniverSlidesPlugin);
  univer.registerPlugin(UniverSlidesUIPlugin);
  univer.registerPlugin(UniverSlidesChartPlugin);
  univer.registerPlugin(UniverSlidesChartUIPlugin);
  univer.registerPlugin(UniverSlidesTablePlugin);
  univer.registerPlugin(UniverSlidesTableUIPlugin);
  univer.registerPlugin(UniverSlidesPrintPlugin);
  univer.registerPlugin(UniverThreadCommentUIPlugin);
  univer.registerPlugin(UniverSlidesThreadCommentUIPlugin);
  return finishHost(univer, config);
}

export function registerHistory(univer: Univer, containerId: string, historyServerUrl: string) {
  univer
    .__getInjector()
    .get(LocaleService)
    .load({ [LocaleType.EN_US]: HistoryEnUS });
  univer.registerPlugin(UniverSlidesHistoryPlugin);
  univer.registerPlugin(UniverSlidesHistoryUIPlugin, {
    univerContainerId: containerId,
    historyServerUrl,
  });
}
