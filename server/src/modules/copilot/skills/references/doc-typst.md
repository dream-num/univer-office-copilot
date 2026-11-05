# Traditional Doc · Typst source bundles

Based on the public @univer-cli/doc-typst-facade 1.3.1 contract and Univer CLI Doc authoring guidance. This sample applies to the fixed current Traditional Doc through collaboration; CLI paths, Worktrees and a separate review step are not used.

## Tool input

Use `office` with an action such as:

```json
{
  "kind": "doc.typst",
  "prelude": "#set page(paper: \"a4\", margin: 36pt)\n#set text(size: 11pt)",
  "pages": [
    "= Quarterly report\n\nRevenue reached *523*.",
    "= Action plan\n\n+ Validate demand\n+ Deliver the pilot"
  ]
}
```

Each array entry is one ordered source file, at most eight entries. The current compiler projects source pages into a continuous native Traditional flow; final physical page count can differ. The first static header/footer can be reused across that flow. Preserve these diagnostics and determine actual page count from office_visual, rather than from the input array length. A shared prelude carries reusable page/text settings. The app creates a private temporary bundle with an explicit manifest and fixed target ID, using only the installed official native binding. Do not submit JavaScript, filesystem paths, CLI commands, a system Typst binary, or a PDF instead of an editable Doc.

This is a complete rewrite. Use it only for generation or an explicit rewrite. Query native Facades for local edits to existing Traditional documents; do not regenerate the whole file to change one sentence.

## Physical layout

Express paper size, orientation, margins, fonts, paragraph leading/spacing and headings deliberately. Use normal/bold weights or a resolvable named face. Fractional point sizes are supported. Do not add ad hoc leading compensation after compilation. Repeated literal headers and footers are supported; do not invent a dynamic page-field API.

For fixed columns, express one grid with all cell arguments:

```typst
#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [Left region],
  [Right region],
)
```

Paginated fixed layouts can lower to native borderless layout tables. Do not switch to a Modern ColumnGroup or simulate page breaks with whitespace.

Tables need explicit structure. Use static column sizes, `table.header`, explicit fills/strokes, colspan/rowspan where supported. For booktabs, use `stroke: none` and explicit `table.hline`/`table.vline`; do not force a full grid on every table. Prefer static semantics over dynamic fill/stroke functions that cannot be mapped faithfully.

SDK 1.3.1 does not lower `#set list(...)` reliably and can insert it as literal text without a compiler diagnostic. Keep native list defaults and use `+` / `-` items. The application preflight rejects this known leaked setting before touching the shared file.

## Assets

Put asset entries under safe `assets/` keys in the action's `assets` object, with `data`, `encoding` (`utf8` or `base64`) and optional `mimeType`. Each asset is at most 1 MiB; total 4 MiB and 20 files. Refer to bundle-root paths such as `#image("assets/logo.svg", width: 120pt, height: 40pt)`. Use local assets and the shared prelude; avoid #import/#include and external packages. Remote URLs, absolute paths and parent traversal are unavailable.

The compiler preserves supported native images rather than image placeholders. Typst lowering does not create native chart objects: add a requested data-driven chart afterward through the native Doc chart Facade. A decorative chart made of text or a bitmap is not a native chart.

## Verification

Read diagnostics including source path/span and mapping grade. Correct one minimal page before expanding a failing bundle. A syntax/evaluator error is not evidence that all tables or grids are unsupported. Errors stop apply; warnings indicate fidelity limits requiring actual review.

Read fresh native flavor, sections, resolved page setup, headers/footers, paragraph order, tables and image bounds. Render every changed physical page with office_visual and check wrapping, clipping and breaks. For reference reconstruction, distinguish the reference image, a direct Typst rendering and the final Univer screenshot; do not claim these are equivalent merely because compilation succeeded.

Keep confirmed edits and history. When the compiler cannot represent a feature, report it rather than silently dropping content or flattening the document into page images.
