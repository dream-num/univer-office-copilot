# Slide authoring

Keep important text ink at least 24px inside the page. Retain generated SVG through office_source for later repair; compare against current native content before replacement. Never add a year or target value that the user did not provide, and label quarter-to-quarter comparisons accurately.

For generated pages use `slide.svg`, not `slide.add` with a title and plain body. SVG is compiled by the official AI SDK into native editable slide elements, with browser-measured text. Use page 1 for an initial blank presentation; page count+1 appends. `mode: replace` replaces exactly the addressed page; use add only for genuinely new elements, never to overlay a correction on broken content.

Before authoring establish the deck's story, page size (normally 1280×720 or 960×540), margins, exact copy, font roles, colors, asset style and page-specific structure. Give each page one core message. Use varied meaningful structures (overview, comparison, process, data, timeline); adjacent pages should not all repeat a title/body layout. Keep a coherent design across pages.

Author complete SVG pages with explicit viewBox, inline styling, font family/size, hex colors and sufficient whitespace. SVG font sizes/geometry use design px; native text font sizes use pt. Use intentional line breaks and concise copy. Prefer readable body text at 20–28px in a 1280px page. Avoid full-page screenshots, decorative blobs, unreadable tiny copy, Unicode icon substitutes, and clip/filter effects that cannot become native elements.

Use `office_resources find` for requested icons/logos/illustrations, then read the exact handle and reference its image data URI. Fixed logos retain their colors. Small bitmap/SVG assets can remain images; text and layout stay editable. Compiler warnings block application. Review returned authoring lints too.

After each page: inspect its native elements; `office_visual` with `kind: lint` and that one-based page; fix every off-page, escaped-container or overlapping-text finding, or explicitly justify an intentional overlap. Then capture a real page preview. Review all changed pages, not just a contact sheet. Check missing content, contrast, clipping, shape stacking, alignment, imagery, arrow endpoints and cross-page consistency. Repair SVG source and replace the same page.

Native charts and tables are deliberate exceptions to SVG generation. Query their native builders and insert after the last full-page replacement, since replacement clears all page elements. Verify their data and mapping. For a localized edit use native shape/text handles and retain IDs. Explicitly set fill/stroke/text color; no-line uses the native NoLine enum. Never manipulate detached shape snapshots and assume persistence.

Additional source guidance: `office_skill` resource `workspace-slide.md` (JavaScript examples describe native API usage; translate them to this application's backend scripts).

The fixed script binding is `presentation`. Before completion call `office_verify` with fresh native readback, task-specific assertions, and an actual rendered target. The corresponding full product reference is already loaded; specialized references remain available through office_skill.
