# Modern Doc Markdown · adapted from Workspace PR #170

Source: dream-num/univer-workspace at f855c66f765c6bf16327669cf60afc12f5e8b59d, Apache-2.0. The syntax and content-quality guidance below come from its Markdown skill. This application edits the fixed shared file directly; Workspace CLI, session paths and Worktree review are not used.

## Application tools

For a new or explicitly rewritten Modern document, use `office` with `action: {kind: "doc.markdown", mode: "replace", markdown: "..."}`. Give regions explicit stable IDs, as in the syntax below. The application retains the SDK execution map. Preserve SDK default typography, body spacing, table styles and native callout colors; do not add cosmetic Facade writes after compilation.

Before each selected edit, use `action: {kind: "doc.markdown.read", blockIds: ["overview"]}`. This reads current native content and refreshes the map, rather than returning the original Markdown. Retain the exported root IDs and asset paths, edit that fragment, then send `action: {kind: "doc.markdown", mode: "replace", blockIds: ["overview"], markdown: "..."}`. Only those roots are replaced. `revision` is read metadata; do not supply expectedRevision or native IDs. On missing/deleted boundaries or unsupported current formatting, report the diagnostic and re-read/replan; do not flatten content or recreate the whole document.

## Univer Markdown v1

Use CommonMark/GFM for headings, paragraphs, bold, italic, strikethrough, inline code, links,
quotes, code blocks, nested lists, tasks, tables, standalone images, and dividers. The compiler
creates editable native Modern content and keeps SDK typography and spacing. Raw HTML, unknown
directives, unsupported attributes, and structures that the SDK cannot represent produce errors.

Give every top-level region you may later update an explicit stable `#id`. A `block` is an
addressing wrapper; it does not create a native BlockRange. Quotes, code, and callouts create
native BlockRanges. Modern columns create a native ColumnGroup, never a Traditional section break.

```markdown
---
univerDoc: 1
title: Product overview
---

:::block{#overview}

# Univer

Native **editable** [Office content](https://univer.ai), with
:span[rich text]{underline="true"} and :range[a bookmark]{#decision kind="bookmark"}.

:::

:::quote{#principle}

A good document communicates its structure before every word is read.

:::

:::callout{#notice}

Review the native document before handing it off.

:::

::::columns{#features gap="24"}

:::column{#left width="1"}

## Native editing

- Tables, images, and rich text
- [x] Editable after compilation

:::

:::column{#right width="1"}

## Shared runtime

| Surface | Content            |
| ------- | ------------------ |
| Browser | Native Docs        |
| Agent   | Markdown authoring |

:::

::::

:::block{#readiness}

## Readiness

| Area    | Status  |
| ------- | ------- |
| Content | Ready   |
| Review  | Pending |

:::

::image{#cover src="assets/cover.svg" width="560"}

::chart{#adoption src="assets/adoption.chart.json"}

::shape{#milestone src="assets/milestone.shape.json"}
```

- `columns` contains 2–5 direct `column` children; positive `width` values are ratios. Nested
  column groups are unsupported. Keep table/image/chart dimensions within their column width.
- Callouts inherit native background and border colors. Omit `tone` unless custom semantic coloring
  was requested; allowed tones are `info`, `success`, `warning`, `danger`, and `neutral`.
- `quote` and `callout` support paragraphs, headings, and lists. Put tables/code outside them.
  List items support paragraphs, headings, and nested lists; put structural blocks outside lists.
- Ordinary GFM tables inherit SDK defaults. Use `:::table{#metrics columnWidths="240,320"}` around
  exactly one GFM table only when explicit widths are needed. Widths must be positive, match the
  column count, and fit the available content width. Keep widths emitted by export when editing text.
- `span` accepts `color`/`background` as `#RRGGBB`, and `bold`, `italic`, `underline`,
  `superscript`, `subscript` as `"true"`/`"false"`. Superscript and subscript are mutually exclusive.
- `range` requires an ID and supports `kind="bookmark"` or `kind="hyperlink" url="https://..."`.
  Mention/Comment identities are unsupported. Standard links allow HTTP, HTTPS, mailto, and
  `#fragment`; resolve relative links to valid destinations before compiling.
- Keep exported `::heading[Title]{id="..." level="2"}` identities and `:br[]` breaks intact.
  Ordinary headings use levels 1–6; standard hard breaks preserve line breaks inside paragraphs.

## Assets in this application

Provide `assets` with safe paths under `assets/`, for example `{"assets/cover.svg":{"data":"<svg ...>...</svg>","encoding":"utf8","mimeType":"image/svg+xml"}}`. PNG/JPEG can use base64 data with `encoding: "base64"`. Each asset is at most 1 MiB, at most 20 assets/4 MiB total. Network asset URLs and filesystem paths are unavailable. Read exports retain image bytes privately in application metadata; do not copy the image placeholder text back as asset data. Existing exported asset paths can be reused without resupplying bytes.

Chart assets are JSON strings: `{version:1,type:"column",title:"Revenue",data:[["Quarter","Revenue"],["Q1",12],["Q2",18]],categoryField:0,valueFields:[1],width:280,height:200}`. Supported types: column, bar, line, area, pie, scatter. The first row contains labels, not plotted data. Shape JSON uses `{version:1,type:"roundRect",text:"Milestone",fill:"#DCFCE7",stroke:"#16A34A",strokeWidth:1,width:240,height:100}`; supported types: rect, roundRect, ellipse, diamond, triangle, arrow. Use native flow objects rather than screenshots.

## Fidelity boundaries

Current native content is authoritative. Export is for generated blocks, not a lossless conversion of arbitrary Docs. Custom fonts/spacing/list indentation, independent adjacent list restarts, merged or richly styled tables, mixed text/image paragraphs, rich code text and custom chart/shape styles can produce blocking diagnostics. Preserve unsupported content and use local native Facades instead. Compiler errors stop generation. Review warnings and actual screenshots, rather than claiming perfect visual fidelity.
