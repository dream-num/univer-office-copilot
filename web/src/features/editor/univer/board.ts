import { type Univer, LocaleService, LocaleType } from '@univerjs/core';
import { UniverBoardsHistoryPlugin } from '@univerjs-pro/boards-history';
import { UniverBoardsHistoryUIPlugin } from '@univerjs-pro/boards-history-ui';
import HistoryEnUS from '@univerjs-pro/boards-history-ui/locale/en-US';
import '@univerjs-pro/boards-history-ui/lib/index.css';
import { mergeLocales } from '@univerjs/core';
import { UniverThreadCommentUIPlugin } from '@univerjs/thread-comment-ui';
import { UniverBoardsThreadCommentUIPlugin } from '@univerjs-pro/boards-thread-comment-ui';
import { UniverBoardsPrintPlugin } from '@univerjs-pro/boards-print';
import InkEnUS from '@univerjs-pro/ink-ui/locale/en-US';
import ChartUIEnUS from '@univerjs-pro/chart-ui/locale/en-US';
import EngineChartEnUS from '@univerjs-pro/engine-chart/locale/en-US';
import CommentsEnUS from '@univerjs-pro/boards-thread-comment-ui/locale/en-US';
import PrintEnUS from '@univerjs-pro/boards-print/locale/en-US';
import '@univerjs-pro/boards-thread-comment-ui/lib/index.css';
import '@univerjs-pro/boards-print/lib/index.css';
import '@univerjs-pro/chart-ui/facade';
import '@univerjs-pro/engine-chart/facade';
import '@univerjs-pro/chart-ui/lib/index.css';
import { UniverBoardsChartPlugin } from '@univerjs-pro/boards-chart';
import { UniverBoardsChartUIPlugin } from '@univerjs-pro/boards-chart-ui';
import ChartEnUS from '@univerjs-pro/boards-chart-ui/locale/en-US';
import '@univerjs-pro/boards-chart/facade';
import '@univerjs-pro/boards-chart-ui/lib/index.css';
import { UniverBoardsMindPlugin } from '@univerjs-pro/boards-mind';
import { UniverBoardsMindUIPlugin } from '@univerjs-pro/boards-mind-ui';
import MindEnUS from '@univerjs-pro/boards-mind-ui/locale/en-US';
import '@univerjs-pro/boards-mind/facade';
import '@univerjs-pro/boards-mind-ui/lib/index.css';
import { UniverBoardsTablePlugin } from '@univerjs-pro/boards-table';
import { UniverBoardsTableUIPlugin } from '@univerjs-pro/boards-table-ui';
import TableEnUS from '@univerjs-pro/boards-table-ui/locale/en-US';
import '@univerjs-pro/boards-table/facade';
import '@univerjs-pro/boards-table-ui/lib/index.css';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import { UniverBoardsPlugin } from '@univerjs-pro/boards';
import { UniverBoardsUIPlugin } from '@univerjs-pro/boards-ui';
import { UniverShapePlugin } from '@univerjs-pro/engine-shape';
import { UniverShapeEditorPlugin } from '@univerjs-pro/shape-editor';
import { UniverShapeEditorUIPlugin } from '@univerjs-pro/shape-editor-ui';
import { UniverInkPlugin } from '@univerjs-pro/ink';
import { UniverInkUIPlugin } from '@univerjs-pro/ink-ui';
import locale from '@univerjs-pro/boards-ui/locale/en-US';
import { finishHost, proHost, type HostConfig } from './common.ts';
import '@univerjs-pro/boards/facade';
import '@univerjs-pro/shape-editor-ui/lib/index.css';
import '@univerjs-pro/ink-ui/lib/index.css';
import '@univerjs-pro/boards-ui/lib/index.css';
export function createHost(config: HostConfig) {
  const univer = proHost(
    config,
    mergeLocales(
      locale,
      InkEnUS,
      ChartUIEnUS,
      EngineChartEnUS,
      CommentsEnUS,
      PrintEnUS,
      ChartEnUS,
      MindEnUS,
      TableEnUS,
    ),
    false,
  );
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverShapePlugin);
  univer.registerPlugin(UniverShapeEditorPlugin);
  univer.registerPlugin(UniverShapeEditorUIPlugin);
  univer.registerPlugin(UniverInkPlugin);
  univer.registerPlugin(UniverInkUIPlugin);
  univer.registerPlugin(UniverBoardsPlugin);
  univer.registerPlugin(UniverBoardsUIPlugin);
  univer.registerPlugin(UniverBoardsChartPlugin);
  univer.registerPlugin(UniverBoardsChartUIPlugin);
  univer.registerPlugin(UniverBoardsMindPlugin);
  univer.registerPlugin(UniverBoardsMindUIPlugin);
  univer.registerPlugin(UniverBoardsTablePlugin);
  univer.registerPlugin(UniverBoardsTableUIPlugin);
  univer.registerPlugin(UniverBoardsPrintPlugin);
  univer.registerPlugin(UniverThreadCommentUIPlugin);
  univer.registerPlugin(UniverBoardsThreadCommentUIPlugin);
  return finishHost(univer, config);
}

export function registerHistory(univer: Univer, containerId: string, historyServerUrl: string) {
  univer
    .__getInjector()
    .get(LocaleService)
    .load({ [LocaleType.EN_US]: HistoryEnUS });
  univer.registerPlugin(UniverBoardsHistoryPlugin);
  univer.registerPlugin(UniverBoardsHistoryUIPlugin, {
    univerContainerId: containerId,
    historyServerUrl,
  });
}
