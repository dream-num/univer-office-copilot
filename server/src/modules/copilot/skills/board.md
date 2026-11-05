# Board authoring

In SDK 1.3.1, `board.getElement(id)` returns a plain element descriptor and `board.getShape(id)` returns a live shape handle. There is no `getElementById` on FBoard. Use exact API lookup before reacquiring handles. Unscoped office_visual previews fit the complete Board automatically; pass region or elementIds only for a focused capture.

Use native editable shapes, text, connectors, tables, charts, images, sticky notes or mind-map objects that express the user's intent. Do not satisfy a diagram request by scattering text blocks. Inspect and preserve deliberate manual layout.

For relationship-heavy diagrams first create a compact semantic plan: meaningful node IDs, relationships, parents/lanes, exact copy, grouping, structure type and key emphasis. Choose a layout that communicates that plan, then translate it into backend Facade calls. The plan is an authoring aid, not another persisted model.

Use office_api to resolve the actual Board APIs and enums. Insert shape geometry via transform, style through native fill/stroke/text methods, retain shape IDs. Create parents before children, and nodes before connectors. Parent-local coordinates differ from Board-world coordinates; confirm parentId/laneId/world bounds. Use element-bound connector endpoints; let automatic routing choose ordinary routes. Explicit sides, ports, control points or label positions require actual diagram semantics or a diagnosed routing issue.

Size text to its node, specify padding/wrapping and sufficient width/height. Use consistent but content-appropriate typography, spacing and colors. Distinguish real relations from visual proximity. Native mind-map branches own their layout; do not drag their geometry independently.

## Diagram visual hierarchy

For polished diagrams, use a deliberate hierarchy instead of identical centered text boxes. Keep ordinary cards left-aligned: a short bold heading, one prominent fact when useful, then concise secondary copy. Use native rich text rather than separate unbound labels that can drift away. Start around 18px for card headings, 14px for supporting text and 28px for key metrics; native `ITextStyle.fs` is in points, so convert requested pixel sizes with `pt = px * 0.75` (18px = 13.5pt). Reserve at least 16px of inner padding and measure the actual English wrapping. Diamonds have a smaller inscribed text region than their outer bounds; use short labels and smaller padding instead of allowing words to split.

Use a quiet canvas, white or softly tinted cards, subtle borders and a small semantic palette. Blue can distinguish disclosed evidence, violet assumptions and amber decisions; label those roles and keep the meaning consistent. Emphasize the primary scenario or critical gate through one stronger border, not heavier decoration on every node. Keep decision text short and centered within native diamonds.

Never insert probe or sample objects into the user's Board to discover styling behavior. Query exact APIs first. If a rich-text builder is unavailable through the fixed script binding, edit the detached public descriptor returned by `getElement()` and commit its complete next model through `updateElement(id, { element })`; do not repeatedly try unavailable root-runtime helpers or mutate live internals.

Use compact stage headings and an aligned spacing grid. Budget connector-label space between cards; route return paths through a separate empty corridor. Do not add huge backdrop shapes that become routing obstacles. Preserve existing IDs and element-bound endpoints when restyling. Keep source notes readable in a dedicated footer instead of compressing the entire URL into a tiny line. Inspect the actual full diagram and dense regions before calling it visually polished; zero layout diagnostics alone is insufficient.

Design reference: [Archify composition and routing defaults](https://github.com/tt-a1i/archify/blob/main/archify/references/authoring-defaults.md). Apply these principles through native Univer elements; do not replace the collaborative Board with an HTML embed or a flattened image.

Verify persisted text, ownership and connector bindings using describeElements and native reads. Use analyzeModelLayout(48) where available, then office_visual Board preview and its rendered layoutAnalysis. Repair actual overlaps, missing/obscured labels, clipping, arrow directions, broken endpoints, excessive detours and low contrast. Re-capture implicated regions. Never delete requested semantics to clear a diagnostic. Static previews do not prove animation or drag/undo behavior.

For relevant diagram families, read these source references through office_skill (resource):
`board/board-spec.md`, `board/flow-state.md`, `board/sequence.md`, `board/class-er.md`, `board/uml-structure.md`, `board/mind-map.md`, `board/content-selection.md`, `board/connector-routing.md`, `board/connector-labels.md`, `board/diagram-review.md`.

Examples in source references describe native JavaScript Facades. Translate calls into this application's backend scripts; workflow/CLI/Worktree instructions do not apply to this immediate-edit sample.

The fixed script binding is `board`. Before completion call `office_verify` with fresh native readback, task-specific assertions, and an actual rendered target. The corresponding full product reference is already loaded; specialized references remain available through office_skill.
