# Sheet authoring

Inspect exact return types: some chart getters return plain descriptors or arrays, not live chart handles. Read their returned data directly; reacquire a live chart by its stable ID only through the exact API. Do not call getInfo on an array/plain descriptor. Avoid freeze boundaries crossing merged title regions when freezing only header rows is sufficient.

Use a real spreadsheet model: explicitly typed cell data, formulas for derived values, usable number formats, coherent headers, sensible widths, frozen headers and meaningful native charts/tables where requested. Avoid a raw grid dump. Keep manual content outside the requested range.

For rich work use backend Facade scripts. `workbook.getActiveSheet` or `getSheetByName` acquires a sheet; `getRange` acquires a range. Write ICellData: `{v:"00123",t:4}` for identifiers, `{v:42,t:2}` for numbers, `{v:1,t:3}` for booleans, `{f:"=SUM(B2:B6)"}` for formulas. Dates/currencies/percentages are numeric values plus number formats, not formatted strings. `setValues` merges cells; clearContent before deliberate region replacement so stale formulas/rich text are removed.

For numeric assertions prefer `getCellDatas()[row][column]?.v` or `getRawValues()`; `getValue()` / `getValues()` may expose formatted strings such as `10,800` or `10.56x`, which must not be compared directly with numbers. Read `getCellDatas`, `getRawValues`, `getFormulas`/the exact API returned by office_api, and display values separately. The application waits for calculation application on loading and writing. Verify actual formula results, dependencies, row order and error cells before completion. Excel structured references need real table formula names, never table IDs or guessed names.

Query exact APIs before number formatting, column widths, freeze, chart/table/filter/pivot/validation/conditional-format/sparkline/image work. Native charts use a detached builder, then build and insert. Verify source range, orientation, category/value mappings, type, title and positioning. Over-grid images need explicit size/row/column and awaited buildAsync. Keep chart/table content editable.

Inspect the changed range and relevant metadata after writing. Capture a narrow useful range in `office_visual`, check alignment, readable widths, number formats, truncation, chart overlap and totals. A stored formula alone does not prove correct calculation.

Additional source guidance: `office_skill` resource `workspace-sheet.md`.

The fixed script binding is `workbook`. Before completion call `office_verify` with fresh native readback, task-specific assertions, and an actual rendered target. The corresponding full product reference is already loaded; specialized references remain available through office_skill.
