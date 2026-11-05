# Office feature profiles

The application pins every public Univer dependency to **1.3.1**. Product hosts are lazy-loaded independently. All registered capabilities use public packages; no SDK UI or Design internals are modified.

## Native editing UI

| Product | Layout                                                    | Registered authoring profile                                                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sheets  | Native `grid` Ribbon: Start, Insert, Formulas, Data, View | Core, drawing/images, conditional formatting, data validation, filter, find/replace, hyperlinks, notes, sort, tables, threaded comments, Advanced preset: Pro formulas, charts, pivot tables/charts, slicers, outlines, shapes, sparklines, print, Exchange client |
| Docs    | Native `grid` Ribbon: Start, Insert, View                 | Core, drawing/images, hyperlinks, threaded comments, find/replace, Advanced preset: print, references, formulas and Exchange client; callouts, charts, code blocks, columns, LaTeX, enhanced lists, quotes, shapes and tables with their authoring UI              |
| Slides  | Native `grid` Ribbon: Start, Insert, View                 | Slides model/UI, Docs text engine, Drawing/Shape editor, charts, tables, print and anchored comments                                                                                                                                                               |
| Bases   | Native Base workbench and field/view toolbar              | Bases model/UI, formula worker, dashboard/pivot runtime and UI, record comments                                                                                                                                                                                    |
| Boards  | Native canvas tools                                       | Boards model/UI, Docs text engine, Drawing/Shape editor, ink, charts, mind maps, tables, print and anchored comments                                                                                                                                               |

Bases does not expose a Sheets-style Ribbon in this public release. Turning on the shared Ribbon would not move its field/view commands into it. The native workbench keeps its creation, fields, grouping, filter, sort, row height and conditional-color controls. Board and Base hosts therefore keep the shared Ribbon hidden.

The SDK handles Ribbon group overflow automatically. Commands retain their native selection, focus and permission conditions; a registered feature can be disabled until a valid editing target is selected.

Slides also exposes its native footer and zoom controls. AI-added pages use the public blank layout, with transparent text shapes, so they do not inherit the initial template's title/body placeholders. The AI authoring path additionally compiles SVG into native editable elements with browser text metrics, layout lint and actual page PNGs. The native 50% preset and persisted three-page generated layouts have been checked with real DeepSeek output; other native zoom interactions still need targeted validation.

Docs has two creation entries: **Modern document** uses the official Markdown compiler, native columns/callouts and block-scoped current-native updates; **Paged document** uses the SDK's `traditional` flavor and the official Typst compiler for native flow, page style, headers/footers and tables. Source page boundaries are not fixed native page breaks. Both use the same editor, collaboration and file-history pipeline.

## Registration and persistence

- `univer/sheet.ts` and `univer/doc.ts` compose official presets plus explicit feature plugins where needed. `presetHost` configures License/Drawing once, then collaboration, then feature UI. This avoids auto-registering those services with empty or conflicting configuration.
- `univer/slide.ts`, `univer/base.ts` and `univer/board.ts` register public model/UI pairs, matching Facades, published CSS, and merged locales explicitly.
- All five browser hosts also register their official History model/UI plugins and locale packs. The shared history core points at the embedded History endpoint. The UI is mounted over the current editor without replacing the application’s conversation state.
- `office/products/plugins.ts` owns headless model/resource registration. It matches the browser's persisted feature types without loading browser UI. The Base browser worker also registers the remote dashboard calculator.
- `office/products/facades.ts` imports the public server Facade extensions for that model profile, including number formats and advanced product objects. Agent authoring, inspection and rendered evidence are described in [AI authoring architecture](ai-authoring.md).
- Drawing uses the SDK's inline image IO with a **1 MiB image limit**. Image bytes travel in Unit content through the existing collaboration and history path. A separate remote image upload/sign service is not required for this local example.
- Threaded comments use the SDK's default snapshot-backed data source. Bodies and anchors remain in Unit resources and changesets; file sharing includes them. Do not add `thread-comment-resource` alone: that plugin strips comment bodies in anticipation of a separate comment service.

## Service boundaries

This is an editing profile, not a deployment of every optional Univer service. File permissions and sharing remain application-owned. File history uses the official product History UI over the embedded SDK service; application ACL and restore coordination still apply. Granular SDK permission administration, a remote resource library, cross-file embeds and attachment storage need their own authorized service adapters.

The Sheets/Docs Advanced presets register Exchange clients and Facades, but the sample has not exposed Office import/export as a finished workspace flow. Its Node conversion adapter still needs server-license validation and file-lifecycle wiring. Other product Exchange clients are not registered against nonexistent routes. The AI SDK's official asset catalog has a separate find/read/cache adapter; it is not a user attachment service or the native editor's remote media service.

Public 1.3.1 includes `bases-dashboard` and `bases-dashboard-ui`; it does not publish `bases-chart`, `bases-chart-ui`, or `bases-print`. The integration uses the published dashboard packages rather than importing private or inferred package names.

Primary references: [Ribbon modes and overflow](https://docs.univer.ai/guides/sheets/features/core#toolbar-layout-and-ribbontype), [Bases core/workbench](https://docs.univer.ai/guides/bases/features/core), and the installed public 1.3.1 preset implementations and declarations.
