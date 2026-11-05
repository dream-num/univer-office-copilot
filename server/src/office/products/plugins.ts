import type { Univer } from '@univerjs/core';
import type { FileType } from '@univer-copilot/shared';
import { UniverDrawingPlugin } from '@univerjs/drawing';
import { UniverThreadCommentPlugin } from '@univerjs/thread-comment';
import { UniverSheetsConditionalFormattingPlugin } from '@univerjs/sheets-conditional-formatting';
import { UniverSheetsDataValidationPlugin } from '@univerjs/sheets-data-validation';
import { UniverSheetsDrawingPlugin } from '@univerjs/sheets-drawing';
import { UniverSheetsFilterPlugin } from '@univerjs/sheets-filter';
import { UniverSheetsHyperLinkPlugin } from '@univerjs/sheets-hyper-link';
import { UniverSheetsNotePlugin } from '@univerjs/sheets-note';
import { UniverSheetsSortPlugin } from '@univerjs/sheets-sort';
import { UniverSheetsTablePlugin } from '@univerjs/sheets-table';
import { UniverSheetsThreadCommentPlugin } from '@univerjs/sheets-thread-comment';
import { UniverDocsDrawingPlugin } from '@univerjs/docs-drawing';
import { UniverDocsHyperLinkPlugin } from '@univerjs/docs-hyper-link';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverProFormulaEnginePlugin } from '@univerjs-pro/engine-formula';
import { UniverSheetsPivotTablePlugin } from '@univerjs-pro/sheets-pivot';
import { UniverSheetSparklinePlugin } from '@univerjs-pro/sheets-sparkline';
import { UniverBasesPlugin } from '@univerjs-pro/bases';
import { UniverBaseDashboardPlugin } from '@univerjs-pro/bases-dashboard';
import { UniverSlidesPlugin } from '@univerjs-pro/slides';
import { UniverBoardsPlugin } from '@univerjs-pro/boards';
import { UniverSheetsChartPlugin } from '@univerjs-pro/sheets-chart';
import { UniverSheetsOutlinePlugin } from '@univerjs-pro/sheets-outline';
import { UniverSheetsPivotChartPlugin } from '@univerjs-pro/sheets-pivot-chart';
import { UniverSheetsShapePlugin } from '@univerjs-pro/sheets-shape';
import { UniverSheetsSlicerPlugin } from '@univerjs-pro/sheets-slicer';
import { UniverDocsCalloutPlugin } from '@univerjs-pro/docs-callout';
import { UniverDocsChartPlugin } from '@univerjs-pro/docs-chart';
import { UniverDocsCodePlugin } from '@univerjs-pro/docs-code';
import { UniverDocsColumnPlugin } from '@univerjs-pro/docs-column';
import { UniverDocsFormulaPlugin } from '@univerjs-pro/docs-formula';
import { UniverDocsLatexPlugin } from '@univerjs-pro/docs-latex';
import { UniverDocsListPlugin } from '@univerjs-pro/docs-list';
import { UniverDocsQuotePlugin } from '@univerjs-pro/docs-quote';
import { UniverDocsReferencePlugin } from '@univerjs-pro/docs-reference';
import { UniverDocsShapePlugin } from '@univerjs-pro/docs-shape';
import { UniverDocsTablePlugin } from '@univerjs-pro/docs-table';
import { UniverSlidesChartPlugin } from '@univerjs-pro/slides-chart';
import { UniverSlidesTablePlugin } from '@univerjs-pro/slides-table';
import { UniverBoardsChartPlugin } from '@univerjs-pro/boards-chart';
import { UniverBoardsMindPlugin } from '@univerjs-pro/boards-mind';
import { UniverBoardsTablePlugin } from '@univerjs-pro/boards-table';

// Match browser model/resource owners so AI edits preserve manually authored content.
export function registerProductPlugins(univer: Univer, type: FileType) {
  univer.registerPlugin(UniverDrawingPlugin);
  univer.registerPlugin(UniverThreadCommentPlugin);
  if (type === 'sheet') {
    univer.registerPlugin(UniverProFormulaEnginePlugin);
    univer.registerPlugin(UniverSheetsPlugin);
    univer.registerPlugin(UniverSheetsNumfmtPlugin);
    univer.registerPlugin(UniverSheetsFormulaPlugin);
    univer.registerPlugin(UniverSheetsConditionalFormattingPlugin);
    univer.registerPlugin(UniverSheetsDataValidationPlugin);
    univer.registerPlugin(UniverSheetsDrawingPlugin);
    univer.registerPlugin(UniverSheetsFilterPlugin);
    univer.registerPlugin(UniverSheetsHyperLinkPlugin);
    univer.registerPlugin(UniverSheetsNotePlugin);
    univer.registerPlugin(UniverSheetsSortPlugin);
    univer.registerPlugin(UniverSheetsTablePlugin);
    univer.registerPlugin(UniverSheetsThreadCommentPlugin);
    univer.registerPlugin(UniverSheetsPivotTablePlugin);
    univer.registerPlugin(UniverSheetSparklinePlugin);
    univer.registerPlugin(UniverSheetsChartPlugin);
    univer.registerPlugin(UniverSheetsOutlinePlugin);
    univer.registerPlugin(UniverSheetsPivotChartPlugin);
    univer.registerPlugin(UniverSheetsShapePlugin);
    univer.registerPlugin(UniverSheetsSlicerPlugin);
  } else if (type === 'base') {
    univer.registerPlugin(UniverProFormulaEnginePlugin);
    univer.registerPlugin(UniverBasesPlugin);
    univer.registerPlugin(UniverBaseDashboardPlugin);
  } else {
    univer.registerPlugin(UniverDocsPlugin);
    if (type === 'doc') {
      univer.registerPlugin(UniverProFormulaEnginePlugin);
      univer.registerPlugin(UniverDocsDrawingPlugin);
      univer.registerPlugin(UniverDocsHyperLinkPlugin);
      univer.registerPlugin(UniverDocsCalloutPlugin);
      univer.registerPlugin(UniverDocsChartPlugin);
      univer.registerPlugin(UniverDocsCodePlugin);
      univer.registerPlugin(UniverDocsColumnPlugin);
      univer.registerPlugin(UniverDocsFormulaPlugin);
      univer.registerPlugin(UniverDocsLatexPlugin);
      univer.registerPlugin(UniverDocsListPlugin);
      univer.registerPlugin(UniverDocsQuotePlugin);
      univer.registerPlugin(UniverDocsReferencePlugin);
      univer.registerPlugin(UniverDocsShapePlugin);
      univer.registerPlugin(UniverDocsTablePlugin);
    } else if (type === 'slide') {
      univer.registerPlugin(UniverSlidesPlugin);
      univer.registerPlugin(UniverSlidesChartPlugin);
      univer.registerPlugin(UniverSlidesTablePlugin);
    } else {
      univer.registerPlugin(UniverBoardsPlugin);
      univer.registerPlugin(UniverBoardsChartPlugin);
      univer.registerPlugin(UniverBoardsMindPlugin);
      univer.registerPlugin(UniverBoardsTablePlugin);
    }
  }
}
