import type { FUniver } from '@univerjs/core/facade';
import { BaseFieldType } from '@univerjs/core';
import { ShapeTypeEnum } from '@univerjs-pro/engine-shape';
import { createSlideByLayout, SlidePageLayoutTypeEnum } from '@univerjs-pro/slides';
import type { OfficeAction, OfficeFile } from '@univer-copilot/shared';
import type { OfficeResult } from '../contracts.ts';

export function applyAction(api: FUniver, file: OfficeFile, action: OfficeAction): OfficeResult {
  const location = { fileId: file.id, type: file.type, label: file.name };
  if (action.kind !== 'inspect' && !action.kind.startsWith(`${file.type}.`))
    throw new Error('The operation does not match the target file type.');
  if (file.type === 'sheet') {
    const workbook = api.getActiveWorkbook();
    if (!workbook) throw new Error('The workbook is not loaded.');
    if (action.kind === 'inspect')
      return {
        summary: 'Read workbook structure',
        content: {
          sheets: workbook.getSheets().map((s) => ({
            id: s.getSheetId(),
            name: s.getSheetName(),
            rows: s.getMaxRows(),
            columns: s.getMaxColumns(),
          })),
          sample: workbook.getActiveSheet()?.getRange('A1:H12').getValues(),
        },
      };
    if (
      action.kind === 'sheet.read' ||
      action.kind === 'sheet.write' ||
      action.kind === 'sheet.format'
    ) {
      const sheet = action.sheetId
        ? workbook.getSheetBySheetId(action.sheetId)
        : workbook.getActiveSheet();
      if (!sheet) throw new Error('That worksheet no longer exists.');
      if (!/^[A-Z]{1,3}[1-9]\d{0,5}(?::[A-Z]{1,3}[1-9]\d{0,5})?$/.test(action.range))
        throw new Error('Use a bounded A1 range.');
      const range = sheet.getRange(action.range);
      if (range.getHeight() * range.getWidth() > 1000)
        throw new Error('Read or edit at most 1,000 cells per operation.');
      if (action.kind === 'sheet.write') {
        if (
          action.values.length !== range.getHeight() ||
          action.values.some((r) => r.length !== range.getWidth())
        )
          throw new Error('The values must have the same dimensions as the target range.');
        range.setValues(
          action.values.map((row) =>
            row.map((value) =>
              typeof value === 'string' && value.startsWith('=') ? { f: value } : { v: value },
            ),
          ),
        );
      }
      if (action.kind === 'sheet.format') {
        if (action.bold !== undefined) range.setFontWeight(action.bold ? 'bold' : 'normal');
        if (action.background) range.setBackground(action.background);
      }
      return {
        summary: `${action.kind === 'sheet.read' ? 'Read' : 'Updated'} ${sheet.getSheetName()}!${action.range}`,
        content: range.getValues(),
        location: {
          ...location,
          sheetId: sheet.getSheetId(),
          range: action.range,
          label: `${sheet.getSheetName()}!${action.range}`,
        },
      };
    }
  }
  if (file.type === 'doc') {
    const document = api.getActiveDocument();
    if (!document) throw new Error('The document is not loaded.');
    if (action.kind === 'inspect')
      return {
        summary: 'Read document paragraphs',
        content: document
          .getParagraphs()
          .slice(0, 100)
          .map((p) => ({ id: p.getId(), text: p.getText().slice(0, 1000) })),
      };
    if (action.kind === 'doc.append') {
      const paragraph = document.appendParagraph(action.text);
      return {
        summary: 'Appended a paragraph',
        content: paragraph.getText(),
        location: { ...location, paragraphId: paragraph.getId(), label: 'New paragraph' },
      };
    }
    if (action.kind === 'doc.replace') {
      const paragraph = document.getParagraph(action.paragraphId);
      if (!paragraph) throw new Error('That paragraph no longer exists. Read the document again.');
      if (!paragraph.setText(action.text)) throw new Error('The paragraph could not be updated.');
      return {
        summary: 'Replaced the selected paragraph',
        content: paragraph.getText(),
        location: { ...location, paragraphId: paragraph.getId(), label: 'Updated paragraph' },
      };
    }
  }
  if (file.type === 'slide') {
    const presentation = api.getActivePresentation();
    if (!presentation) throw new Error('The presentation is not loaded.');
    if (action.kind === 'inspect')
      return {
        summary: 'Read presentation',
        content: presentation
          .getSlides()
          .slice(0, 30)
          .map((s) => ({
            id: s.getId(),
            name: s.getName(),
            elements: s.getElements().map((e) => ({
              id: e.getId(),
              text: s.getShape(e.getId())?.getText().getPlainText(),
            })),
          })),
      };
    if (action.kind === 'slide.add') {
      const slide = presentation.appendSlide(
        createSlideByLayout({
          name: action.title,
          layoutType: SlidePageLayoutTypeEnum.Blank,
        }),
      );
      const { width, height } = slide.getPageSize();
      for (const [text, top, h, size] of [
        [action.title, 0.08, 0.18, 32],
        [action.body, 0.31, 0.55, 20],
      ] as const) {
        const shape = slide.insertShape({
          shapeType: ShapeTypeEnum.Rect,
          transform: {
            left: width * 0.07,
            top: height * top,
            width: width * 0.86,
            height: height * h,
          },
        });
        if (!shape) throw new Error('A slide shape could not be inserted.');
        shape.setNoneFill().setStrokeOpacity(0);
        shape.getText().setText(text).setFontSize(size).setColor('#242429');
      }
      return {
        summary: `Added slide: ${action.title}`,
        content: slide.getPageLayout(),
        location: { ...location, pageId: slide.getId(), label: action.title },
      };
    }
  }
  if (file.type === 'base') {
    const base = api.getActiveBase();
    if (!base) throw new Error('The relational table is not loaded.');
    if (action.kind === 'inspect')
      return {
        summary: 'Read relational tables',
        content: base.getTables().map((t) => ({
          id: t.getId(),
          name: t.getName(),
          fields: t.getFields().map((f) => ({ id: f.getId(), name: f.getName() })),
          records: t
            .getRecords()
            .slice(0, 30)
            .map((r) => ({ id: r.getId(), values: r.getValues() })),
        })),
      };
    if (action.kind === 'base.add') {
      const table = action.tableId
        ? base.getTableById(action.tableId)
        : (base.getTables()[0] ?? base.insertTable('Table1'));
      if (!table) throw new Error('That table no longer exists.');
      const values: Record<string, string | number | null> = {};
      for (const [name, value] of Object.entries(action.values)) {
        const field =
          table.getFieldByName(name) ??
          table.addField(
            name,
            typeof value === 'number' ? BaseFieldType.Number : BaseFieldType.Text,
          );
        values[field.getId()] = typeof value === 'boolean' ? String(value) : value;
      }
      const record = table.addRecord(values);
      return {
        summary: `Added a record to ${table.getName()}`,
        content: record.getValues(),
        location: {
          ...location,
          tableId: table.getId(),
          elementId: record.getId(),
          label: `${table.getName()} / new record`,
        },
      };
    }
  }
  if (file.type === 'board') {
    const board = api.getActiveBoard();
    if (!board) throw new Error('The canvas is not loaded.');
    if (action.kind === 'inspect')
      return { summary: 'Read canvas elements', content: board.describeElements().slice(0, 100) };
    if (action.kind === 'board.text') {
      const element = board.insertText({
        text: action.text,
        left: action.x,
        top: action.y,
        width: 360,
        textStyle: { fontSize: 24 },
      });
      if (!element) throw new Error('The text could not be inserted.');
      return {
        summary: 'Added text to the canvas',
        content: board.describeElement(element.id),
        location: { ...location, elementId: element.id, label: action.text.slice(0, 60) },
      };
    }
  }
  throw new Error('This operation is not supported for the target file.');
}

/** A bounded structural read after the collaboration ACK; not a claim of semantic correctness. */
export function readAfterWrite(
  api: FUniver,
  file: OfficeFile,
  action: { kind: string },
  result: OfficeResult,
): OfficeResult {
  const location = result.location;
  if (action.kind === 'inspect' || action.kind === 'sheet.read') return result;
  let content: unknown;
  if (location?.range) {
    const sheet = api.getActiveWorkbook()?.getSheetBySheetId(location.sheetId!);
    if (!sheet) throw new Error('The edited worksheet could not be read back.');
    content = sheet.getRange(location.range).getValues();
  } else if (location?.paragraphId) {
    const paragraph = api.getActiveDocument()?.getParagraph(location.paragraphId);
    if (!paragraph) throw new Error('The edited paragraph could not be read back.');
    content = paragraph.getText();
  } else if (location?.pageId) {
    const slide = api.getActivePresentation()?.getSlideById(location.pageId);
    if (!slide) throw new Error('The new slide could not be read back.');
    content = slide.getPageLayout();
  } else if (file.type === 'base' && location?.tableId) {
    const record = api
      .getActiveBase()
      ?.getTableById(location.tableId)
      ?.getRecords()
      .find((r) => r.getId() === location.elementId);
    if (!record) throw new Error('The new record could not be read back.');
    content = record.getValues();
  } else if (file.type === 'board' && location?.elementId) {
    content = api.getActiveBoard()?.describeElement(location.elementId);
    if (!content) throw new Error('The new canvas element could not be read back.');
  } else throw new Error('The edited content has no readable location.');
  return { ...result, content, checked: true };
}
