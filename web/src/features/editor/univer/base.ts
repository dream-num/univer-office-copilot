import { type Univer, LocaleService, LocaleType } from '@univerjs/core';
import { UniverBasesHistoryPlugin } from '@univerjs-pro/bases-history';
import { UniverBasesHistoryUIPlugin } from '@univerjs-pro/bases-history-ui';
import HistoryEnUS from '@univerjs-pro/bases-history-ui/locale/en-US';
import '@univerjs-pro/bases-history-ui/lib/index.css';
import { UniverBasesPlugin } from '@univerjs-pro/bases';
import { UniverBasesUIPlugin } from '@univerjs-pro/bases-ui';
import { UniverProFormulaEnginePlugin } from '@univerjs-pro/engine-formula';
import { UniverRPCMainThreadPlugin } from '@univerjs/rpc';
import { UniverThreadCommentUIPlugin } from '@univerjs/thread-comment-ui';
import { UniverBaseDashboardPlugin } from '@univerjs-pro/bases-dashboard';
import { UniverBaseDashboardUIPlugin } from '@univerjs-pro/bases-dashboard-ui';
import { UniverBasesThreadCommentUIPlugin } from '@univerjs-pro/bases-thread-comment-ui';
import { mergeLocales } from '@univerjs/core';
import { IAttachmentIoService } from '@univerjs-pro/collaboration-client';
import locale from '@univerjs-pro/bases-ui/locale/en-US';
import BasesEnUS from '@univerjs-pro/bases/locale/en-US';
import DashboardEnUS from '@univerjs-pro/bases-dashboard-ui/locale/en-US';
import CommentsEnUS from '@univerjs-pro/bases-thread-comment-ui/locale/en-US';
import ChartUIEnUS from '@univerjs-pro/chart-ui/locale/en-US';
import EngineChartEnUS from '@univerjs-pro/engine-chart/locale/en-US';
import { finishHost, proHost, type HostConfig } from './common.ts';
import '@univerjs-pro/bases/facade';
import '@univerjs-pro/bases-ui/facade';
import '@univerjs-pro/bases-dashboard/facade';
import '@univerjs-pro/chart-ui/facade';
import '@univerjs-pro/engine-chart/facade';
import '@univerjs-pro/chart-ui/lib/index.css';
import '@univerjs-pro/bases-thread-comment-ui/lib/index.css';
import '@univerjs-pro/bases-ui/lib/index.css';
export async function createHost(config: HostConfig) {
  const worker = new Worker(new URL('./base.worker.ts', import.meta.url), { type: 'module' });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The table worker did not initialize.')),
        20000,
      );
      worker.addEventListener('message', (event) => {
        if (event.data.type === 'copilot.ready') {
          clearTimeout(timer);
          resolve();
        }
      });
      worker.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('The table worker could not start.'));
        },
        { once: true },
      );
      worker.postMessage({ type: 'copilot.initialize', license: config.license });
    });
    const univer = proHost(
      config,
      mergeLocales(locale, BasesEnUS, DashboardEnUS, CommentsEnUS, ChartUIEnUS, EngineChartEnUS),
      false,
    );
    univer.registerPlugin(UniverProFormulaEnginePlugin, { notExecuteFormula: true });
    univer.registerPlugin(UniverRPCMainThreadPlugin, { workerURL: worker });
    univer.registerPlugin(UniverBasesPlugin);
    univer.registerPlugin(UniverBasesUIPlugin, {
      override: [[IAttachmentIoService, null]],
      workbench: { footer: false },
    });
    univer.registerPlugin(UniverBaseDashboardPlugin, { notExecuteCalculation: true });
    univer.registerPlugin(UniverBaseDashboardUIPlugin);
    univer.registerPlugin(UniverThreadCommentUIPlugin);
    univer.registerPlugin(UniverBasesThreadCommentUIPlugin);
    return { ...finishHost(univer, config), disposeWorker: () => worker.terminate() };
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

export function registerHistory(univer: Univer, containerId: string, historyServerUrl: string) {
  univer
    .__getInjector()
    .get(LocaleService)
    .load({ [LocaleType.EN_US]: HistoryEnUS });
  univer.registerPlugin(UniverBasesHistoryPlugin);
  univer.registerPlugin(UniverBasesHistoryUIPlugin, {
    univerContainerId: containerId,
    historyServerUrl,
  });
}
