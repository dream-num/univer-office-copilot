import {
  type Univer,
  type Workbook,
  ICommandService,
  IUniverInstanceService,
  LocaleService,
  LocaleType,
} from '@univerjs/core';
import { IRenderManagerService } from '@univerjs/engine-render';
import { UniverSheetsHistoryPlugin } from '@univerjs-pro/sheets-history';
import { UniverSheetsHistoryUIPlugin } from '@univerjs-pro/sheets-history-ui';
import HistoryEnUS from '@univerjs-pro/sheets-history-ui/locale/en-US';
import '@univerjs-pro/sheets-history-ui/lib/index.css';
import { mergeLocales } from '@univerjs/presets';
import {
  MoveRangeMutation,
  SetRangeValuesMutation,
  SheetSkeletonManagerService,
  UniverSheetsCorePreset,
} from '@univerjs/preset-sheets-core';
import CoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing';
import DrawingEnUS from '@univerjs/preset-sheets-drawing/locales/en-US';
import '@univerjs/preset-sheets-drawing/lib/index.css';
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting';
import ConditionalFormattingEnUS from '@univerjs/preset-sheets-conditional-formatting/locales/en-US';
import '@univerjs/preset-sheets-conditional-formatting/lib/index.css';
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation';
import DataValidationEnUS from '@univerjs/preset-sheets-data-validation/locales/en-US';
import '@univerjs/preset-sheets-data-validation/lib/index.css';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import FilterEnUS from '@univerjs/preset-sheets-filter/locales/en-US';
import '@univerjs/preset-sheets-filter/lib/index.css';
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace';
import FindReplaceEnUS from '@univerjs/preset-sheets-find-replace/locales/en-US';
import '@univerjs/preset-sheets-find-replace/lib/index.css';
import { UniverSheetsHyperLinkPreset } from '@univerjs/preset-sheets-hyper-link';
import HyperLinkEnUS from '@univerjs/preset-sheets-hyper-link/locales/en-US';
import '@univerjs/preset-sheets-hyper-link/lib/index.css';
import { UniverSheetsNotePreset } from '@univerjs/preset-sheets-note';
import NoteEnUS from '@univerjs/preset-sheets-note/locales/en-US';
import '@univerjs/preset-sheets-note/lib/index.css';
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort';
import SortEnUS from '@univerjs/preset-sheets-sort/locales/en-US';
import '@univerjs/preset-sheets-sort/lib/index.css';
import { UniverSheetsTablePreset } from '@univerjs/preset-sheets-table';
import TableEnUS from '@univerjs/preset-sheets-table/locales/en-US';
import '@univerjs/preset-sheets-table/lib/index.css';
import { UniverSheetsThreadCommentPreset } from '@univerjs/preset-sheets-thread-comment';
import ThreadCommentEnUS from '@univerjs/preset-sheets-thread-comment/locales/en-US';
import '@univerjs/preset-sheets-thread-comment/lib/index.css';
import { UniverSheetsAdvancedPreset } from '@univerjs/preset-sheets-advanced';
import AdvancedEnUS from '@univerjs/preset-sheets-advanced/locales/en-US';
import '@univerjs/preset-sheets-advanced/lib/index.css';
import ChartUIEnUS from '@univerjs-pro/chart-ui/locale/en-US';
import EngineChartEnUS from '@univerjs-pro/engine-chart/locale/en-US';
import { MAX_IMAGE_BYTES, presetHost, type HostConfig } from './common.ts';
export function createHost(config: HostConfig) {
  const host = presetHost(
    config,
    mergeLocales(
      CoreEnUS,
      DrawingEnUS,
      ConditionalFormattingEnUS,
      DataValidationEnUS,
      FilterEnUS,
      FindReplaceEnUS,
      HyperLinkEnUS,
      NoteEnUS,
      SortEnUS,
      TableEnUS,
      ThreadCommentEnUS,
      AdvancedEnUS,
      ChartUIEnUS,
      EngineChartEnUS,
    ),
    UniverSheetsCorePreset({
      container: config.container,
      ribbonType: 'grid',
      menu: { 'sheet.contextMenu.permission': { hidden: true } },
    }),
    [
      UniverSheetsDrawingPreset({ allowImageSize: MAX_IMAGE_BYTES }),
      UniverSheetsConditionalFormattingPreset(),
      UniverSheetsDataValidationPreset(),
      UniverSheetsFilterPreset({ enableSyncSwitch: true }),
      UniverSheetsFindReplacePreset(),
      UniverSheetsHyperLinkPreset(),
      UniverSheetsNotePreset(),
      UniverSheetsSortPreset(),
      UniverSheetsTablePreset(),
      UniverSheetsThreadCommentPreset(),
      UniverSheetsAdvancedPreset({ license: config.license, universerEndpoint: location.origin }),
    ],
  );
  // SDK 1.3.1 can apply remote values before the active-sheet render catches up
  // with a preceding sheet deletion. Initialize its public render service first;
  // otherwise partial repaint throws and collaboration enters apply_failed.
  const injector = host.univer.__getInjector();
  const instances = injector.get(IUniverInstanceService);
  const renders = injector.get(IRenderManagerService);
  const listener = injector.get(ICommandService).beforeCommandExecuted((command, options) => {
    if (
      !options?.fromCollab ||
      (command.id !== SetRangeValuesMutation.id && command.id !== MoveRangeMutation.id)
    )
      return;
    const { unitId } = command.params as { unitId: string };
    const sheet = instances.getUnit<Workbook>(unitId)?.getActiveSheet();
    const render = renders.getRenderUnitById(unitId);
    if (!sheet || !render) return;
    const skeletons = render.with(SheetSkeletonManagerService);
    if (skeletons.getCurrentParam()?.sheetId !== sheet.getSheetId())
      skeletons.setCurrent({ sheetId: sheet.getSheetId() });
  });
  host.univer.onDispose(() => listener.dispose());
  return host;
}

export function registerHistory(univer: Univer, containerId: string, historyServerUrl: string) {
  univer
    .__getInjector()
    .get(LocaleService)
    .load({
      [LocaleType.EN_US]: {
        ...HistoryEnUS,
        'sheets-history-ui': {
          ...HistoryEnUS['sheets-history-ui'],
          viewer: {
            ...HistoryEnUS['sheets-history-ui'].viewer,
            panel: {
              ...HistoryEnUS['sheets-history-ui'].viewer.panel,
              revertConfirmText:
                'Restore the whole shared file to this version? Later edits stay in history. Active Copilot work will stop.',
            },
          },
        },
      },
    });
  univer.registerPlugin(UniverSheetsHistoryPlugin);
  univer.registerPlugin(UniverSheetsHistoryUIPlugin, {
    univerContainerId: containerId,
    historyServerUrl,
  });
}
