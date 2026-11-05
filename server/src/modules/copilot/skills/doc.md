# Doc authoring · Modern and Traditional

Inspect the actual document flavor first (`getDocumentFlavor`, `isModern`, `isTraditional`). New files expose Modern document or Paged document; Paged document uses the SDK's `traditional` flavor. Do not change a file's flavor implicitly. Both remain native editable Docs. Creation/rewrite must use the matching compiler; local edits use native Facades.

## Modern · Markdown

Use `doc.markdown` for a new or explicitly rewritten Modern document. The official AI SDK compiler creates native headings, rich text, links, bookmarks, lists/tasks, tables, quotes, code, callouts, ColumnGroups, images, charts and shapes. The full `workspace-markdown.md` reference is loaded for this flavor.

Give every region that might be updated a stable explicit `#id`. The app saves the actual execution map; do not create native IDs or source-map JSON yourself. Before each partial edit call `doc.markdown.read` with selected `blockIds`. This exports current native content, resources and a refreshed mapping, including editor changes. Retain exported root IDs and asset paths, then call `doc.markdown` with the same `blockIds` and edited Markdown. `mode: replace` with blockIds replaces only those blocks. Without blockIds it rewrites the document; use that only when requested. `mode: append` adds a generated region.

Keep SDK default typography, spacing and callout colors. Modern columns use `columns`/`column`, not Traditional section breaks or layout tables. Do not apply cosmetic Facade patches after conversion. Unknown directives, raw HTML, invalid assets and unsupported current formatting produce blocking diagnostics; preserve existing content and report the exact limit instead of flattening it. Original Markdown is not the authority after native edits; `office_source` is provenance only.

## Traditional · Typst

Use `doc.typst` for new or explicitly rewritten physical-page documents. The `doc-typst.md` reference is loaded for this flavor. Supply complete ordered page sources, optional shared prelude and local assets. The application compiles through the official native binding, validates a disposable document, then applies the same generated Facade program to the current collaborative file. It does not create another workspace file or embed a PDF/image.

Typst compilation is a complete rewrite, so use native Facades for local text/table/page/header edits and preserve unrelated content. Do not use Markdown's Modern columns for paginated layouts. Native page dimensions, section boundaries, headers/footers and tables must be read back, then every requested page must be rendered. Warnings require review; errors block apply.

## Local native editing

Use `doc.getParagraphs()` to read stable IDs and `doc.getParagraph(id)` to reacquire a paragraph. For header/footer text, pass the segment ID to `doc.getParagraph(id, segmentId)` or `doc.getTextRange(start,end,segmentId)`; inspect all paragraphs, not only the first. Paragraphs provide `getText`, `setText`, `getRange`, `getInfo`, `setStyle`; do not guess `getStyle` or `getTextRange` on a paragraph. Inline ranges belong to `doc.getTextRange(start,end)`. Reacquire offsets after edits. Table cells must be addressed by the native table and `getCellContentRange`, not duplicate text searches across the whole document.

Query exact methods/types with office_api. For intentional manual paragraph styling, AUTO `lineSpacing` is a multiplier such as 1.45, not 145. Physical page/section/header/footer APIs require Traditional flavor. Native charts use detached `doc.newChart` builders, `build`, and `insertChart`; verify their data mapping and geometry. Images need deterministic dimensions and inline/local bytes, with explicit wrapping and awaited mutations. Never alter body markers, table storage or runtime services in a Facade plan.

After writes, inspect current native text, object identities, formatting, types and page structure relevant to the task, then use office_visual. Only image-capable routes receiving actual images may claim pixel inspection. Keep the final chat concise and describe confirmed business results, not API transcripts.

The fixed script binding is `doc`. Before completion call `office_verify` with fresh native readback, task-specific assertions, and an actual rendered target. The corresponding full product reference is already loaded; specialized references remain available through office_skill.
