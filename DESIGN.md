# Design system · Univer Office Copilot

## Product context

An Office editor with a contextual conversation assistant, for developers and people working with spreadsheets, documents, slides, relational tables, and canvases. The editor is the main work surface. Workspace navigation and Copilot support that work without competing with the file.

User direction, 2026-11-03: modernize the initial green interface; give both side panels one consistent color system across all products; keep green available for Sheet names; make workspace navigation collapsible and prioritize spreadsheet space.

## Direction

**Graphite / soft white.** Compact application chrome, quiet gray panels, white content, and restrained product accents. A small brand mark, precise typography, and surface hierarchy carry the identity. Primary actions use ink rather than a product-specific hue.

Use the current official Univer mark from [univer.ai](https://univer.ai/favicon.svg), stored locally as `web/public/univer-logo.svg`. Preserve its original monochrome artwork and proportions: 28px in the header and shared conversation brand, 32px on startup and sign-in. Use the same asset for the favicon.

Deliberate choices: the workspace starts as a narrow rail to maximize the editor, and product identity appears on file names/icons rather than tinting the application. The tradeoff is that the file tree requires one click to reveal; New File and recent files remain accessible in the rail.

## Typography

- **Application UI:** Geist Variable, self-hosted through `@fontsource-variable/geist`; no runtime font CDN.
- **Labels and navigation:** 11–13px, weights 400–550.
- **Panel titles:** 14px, weight 600.
- **Numeric UI:** tabular figures.
- **Conversation:** 14px text with 1.8 line height; provider reasoning uses 13px text with 1.75 line height. User messages align right in a soft neutral bubble; assistant replies use the panel surface without a repeated author heading.
- **Form controls:** 13px text in 36px controls, with 12px visible labels. Menus use the same text size, row spacing and selected-state alignment. Dialog titles are 18px, with 13px supporting text.
- **Office content:** the SDK and file's own typography. Application styling does not rewrite cell or document formatting.
- **Office controls:** use the native two-row `grid` Ribbon for Sheets, Docs, and Slides. Bases keeps its native field/view toolbar; Boards keeps its canvas tools. Let the SDK move whole Ribbon groups into More at narrow widths.
- **Font license:** the Geist OFL notice is included under `web/public/fonts`.

## Colors

| Role           | Value     | Use                                  |
| -------------- | --------- | ------------------------------------ |
| Ink            | `#242429` | Main text                            |
| Primary        | `#27272a` | Send/action buttons and brand mark   |
| Panel          | `#f7f7f8` | Workspace, Copilot, and top bar      |
| Surface        | `#ffffff` | Editor, composer, menus, and dialogs |
| Border         | `#e4e4e7` | Panel and control boundaries         |
| Muted          | `#71717a` | Secondary text and icons             |
| Hover          | `#ededf0` | Navigation hover/selection           |
| Sheet identity | `#21855b` | Sheet file names and icons           |
| Doc identity   | `#3b6fba` | Modern and paged Doc icons           |
| Slide identity | `#b96732` | Slide icons                          |
| Base identity  | `#8160b2` | Base icons                           |
| Board identity | `#2d858d` | Board icons                          |

Each product uses one restrained icon accent consistently in the New file menu, collapsed rail, expanded file list, current title and default-icon preview. Modern and paged documents share the Doc accent. Navigation labels remain neutral, with the existing green Sheet-name accent retained; emoji overrides keep their native colors. Panel surfaces, selection backgrounds and primary actions remain graphite/white across all products. Error and restore-warning colors retain their semantic meanings. SDK selection colors and license indicators remain under SDK control. This revision defines a light theme; dark mode is outside this change.

## Layout and spacing

- **Top bar:** 48px.
- **Workspace:** 48px collapsed, 228px expanded; non-secret preference saved locally. The rail retains creation, recent files, shared files, and trash access.
- **Editor:** flexible, filling all remaining space.
- **Copilot:** 336px by default; drag the left boundary between 300px and 640px. The desktop maximum tightens to preserve a 480px editor where space permits. Save the user's preferred width locally, and restore it when the viewport grows again.
- **Small screens:** workspace expands as an overlay; Copilot begins collapsed and opens as an overlay. Neither requires the document to scroll horizontally.
- **Spacing unit:** 4px; use 8/12/16/24px for normal gaps and padding.
- **Radius:** 8px controls, 12px menus, 18px user bubbles, 20px composer, 16px dialogs. The primary Send/Stop action is circular.
- **Dialog insets:** 24px on desktop, 20px on small screens, with 16px of viewport clearance. Titles and content share their left alignment. Long content scrolls inside the surface.
- **Select insets:** 12px on both sides; keep a fixed gap before the arrow and space for the selected check in the menu.
- **Elevation:** shallow neutral shadows on menus, selected rows, and the composer. No colored shadows or decorative gradients.

## Interaction

- The workspace fills a fixed viewport. Disable document-level scrolling and overscroll gestures while the Office shell is mounted; keep scrolling inside the editor, navigation, chat, composer and dialogs. Contain application scroll areas at their boundaries without cancelling global wheel/touch events. Shared conversation pages retain normal document scrolling.
- Workspace and Copilot share a slim edge handle. It rests as a short line in the panel boundary; hover or keyboard focus reveals a directional arrow and a text hint. It exposes `aria-expanded` and an accessible name and works with Enter/Space or a tap.
- Keep the handle in the same boundary position across collapsed/expanded states. Do not add separate window/sidebar icons to the panel headers. The collapsed Copilot edge occupies 18px.
- On narrow screens, leave at least 80px beside the Copilot overlay so the two 24px handle targets retain an 8px gap and can be tapped independently.
- The resize target starts below the collapse handle and runs down the boundary. Use pointer capture and `touch-action: none` so dragging cannot select cells or scroll the page. Arrow keys resize by 20px (40px with Shift), Home/End reach the bounds, Enter or a double-click resets the default, and Escape cancels an active drag. Resizing keeps the editor, conversation and draft mounted.
- Put the Ask/Edit mode menu, model selection, attachment and selection actions on the left of the composer's bottom row, level with Send/Stop on the right. Mode always shows its current word and a chevron; its menu explains read-only Ask versus direct Edit. Disable mode changes during execution or file history, and disable Edit for viewers. Model selection uses an icon and chevron at compact widths; reveal the profile name when the panel's content reaches 400px and let it truncate before displacing other controls. The full name/model is available in the trigger tooltip and the menu. Context actions remain icons with functional tooltips. Container queries follow the actual panel width rather than the viewport.
- The composer starts with two text rows and grows upward to ten as typing, pasting or wrapping adds lines. Its bottom action row stays anchored. Limit the input to 30% of viewport height on short screens, then scroll inside the input. Clearing the text shrinks it back; panel resizing keeps the text and recalculates wrapping.
- The paperclip offers local upload and workspace selection. Dragging files onto Copilot reveals a quiet dashed drop target without covering the editor. Place compact attachment cards above the input: thumbnail/product icon, truncated name, format/size and remove. Show real upload progress, processing, inline failure and retry. Two columns fit wide panels; narrow panels use one scrollable column. Clicking previews the image or extracted text; sent messages retain read-only cards. Keep uploads and drafts associated with their original chat during conversation switches. Explain unsupported image models and scanned PDFs where they occur.
- The model menu uses radio selection, a keyboard focus loop, Escape/outside dismissal, and a model-management entry. Disable model changes during sending/running. Keep page-entered keys in memory and preserve the draft when selecting a model. Local demo profiles may instead use a server-only environment key; show its availability without revealing it. There is no independent model footer.
- Application controls use shared Tailwind 4/Radix components, with an `app:` prefix and no global Preflight. Native Office controls retain their SDK styling. See [UI implementation](docs/ui-system.md).
- File history uses Univer’s official product viewer inside the editor area, with its native version list, read-only preview, differences and restoration. The right conversation stays mounted but is hidden while history is open, including its edge handle. Preserve its expanded/collapsed preference, width and draft; restore that state when history closes. Per-turn records expand into SDK-computed before/after values with product labels and Sheet cell addresses. Keep them scoped to the turn, with paged details, per-edit and whole-turn restore entries and one Open file history action. Do not duplicate the full native version list in an application dialog. Whole-file restores require an explicit confirmation, default to Cancel and reject concurrent changes.
- Form errors appear in the active dialog. Creation, renaming and deleting use application dialogs with pending/error feedback and a cancel action.
- Escape collapses workspace when focus is inside its navigation; dialogs keep their own Escape behavior.
- Copilot has one compact header: the conversation title/switcher on the left, New and Share on the right. Ask/Edit belongs to the composer because it controls the next message. Do not repeat the product title or current file name. Empty conversations show one quiet welcome heading, two product-specific examples and, when needed, an in-chat model-setup action. Examples fill the composer without sending and select Edit mode for editable files or Ask for viewers. Hide this welcome while a draft or messages are present.
- Icon actions retain explicit accessible names and show shared Radix tooltips on hover and keyboard focus. Tooltips explain the action; they do not repeat decorative labels. Keep Ask/Edit as words because the mode affects whether the file can change. Retain errors, loading states, attached/selected context and destructive-operation consequences.
- File import lives in the New file menu in both workspace states. Export uses a compact header download action. Both use shared dialogs, inline errors and pending states; export flushes edits before download. Keep product-specific format choices inside the dialog.
- File icons default to their product icon. The owner can choose an emoji in Manage file, search or browse categories, and restore the product default. Choosing previews the pending icon; Save changes commits it to the sidebar rail, expanded file list and current title. Cancel discards the pending choice. Keep the picker in a viewport-bounded popover with the neutral panel palette.
- Distinguish document flavors by shape: Modern documents use Lucide `NotepadText`; Paged documents use `FileText` with a folded paper corner. Apply the distinction in creation, navigation, the current title and default-icon previews, using the same blue Doc accent. User-selected emoji still take precedence.
- File-type changes do not change the panel palette.
- Use **Paged document** for the paper-based document creation entry and default file name. Keep the SDK's `traditional` flavor and Typst authoring path internally; this is a display name, not a format migration.
- Show one inline loading indicator after the active reply, with its label driven by real response/reasoning/tool events. The active turn's icon-and-text “View changes” button appears after execution ends. Provider reasoning is collapsible and limited to 240px or 30% of the viewport when expanded.
- Keep conversation chrome light: no visible You/Copilot labels on each message, no outlined model chip inside the composer, and no brain illustration for model selection. Use consistent 17px Lucide icons with a 1.7px stroke and 32px composer action targets. The model trigger remains an icon at narrow widths, with its full name in the tooltip.
- Label the provider's reasoning disclosure “Thought process”; place the chevron after the label, and use a thin neutral guide beside expanded content. Loading uses three opacity-pulsing dots and the real activity label; reduced motion keeps the dots static. The composer uses a restrained focus border and shallow shadow rather than an extra heavy frame.
- Functional hover transitions are approximately 120ms. Reduced-motion preferences disable transitions and spinning indicators.
- Keep keyboard focus indicators visible. Confirm layout against actual SDK canvases, not just editor loading placeholders.

## Research

Reviewed official sources on 2026-11-03:

- [Notion 3.4 · March 2026 sidebar](https://www.notion.com/releases/2026-03-26): navigation that can be customized to the work at hand.
- [Linear's interface design](https://linear.app/now/how-we-redesigned-the-linear-ui): density, alignment, and clear application chrome. This is a foundational 2024 article, not a 2026 announcement.
- [Linear's current changelog](https://linear.app/changelog): current working interfaces and contextual AI surfaces.
- [Raycast's May 2026 redesign](https://www.raycast.com/blog/the-new-raycast): coordinated AI entry points and functional visual hierarchy.
- [Cursor model selection](https://prod.cursor.com/docs/agent/prompting): a model picker near the chat input. The initial top-row placement was replaced by the user's bottom-row preference on 2026-11-04.
- [GitHub Copilot model selection](https://docs.github.com/en/copilot/how-tos/github-copilot-app/choose-a-model): another mainstream pattern keeps model controls beside the prompt, below its input.

Attachment interaction reviewed on 2026-11-04: [Claude file uploads](https://support.claude.com/en/articles/8241126-upload-files-to-claude) supports selection and drag/drop into chat. This sample follows the composer-card pattern while keeping private raw resources separate from native Office references.

These inform the hierarchy and interaction decisions. The Office sample uses its own light, neutral system rather than reproducing another product's theme.

## Decisions

| Date       | Decision                                                                                     | Reason                                                                             |
| ---------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 2026-11-03 | Replace the green shell with graphite and equal gray side panels                             | User requested a modern, product-independent interface                             |
| 2026-11-03 | Collapsed workspace by default, with creation and file access retained                       | Prioritize the spreadsheet while keeping navigation reachable                      |
| 2026-11-03 | Use self-hosted Geist                                                                        | Consistent application typography with local font loading                          |
| 2026-11-03 | Use shared boundary handles in place of boxed sidebar icons                                  | User requested a more subtle and contemporary panel control                        |
| 2026-11-03 | Bounded, persistent Copilot resizing and a responsive composer model picker                  | User requested adjustable width and a compact model entry near the prompt          |
| 2026-11-04 | Shared Tailwind/Radix controls, explicit version-row hierarchy and scoped application styles | User requested a full UI polish pass and consistent dropdown spacing               |
| 2026-11-04 | Remove repeated file/title/help chrome and use semantic icon tooltips                        | User requested a quieter interface with explanations attached to actions           |
| 2026-11-04 | Bottom-row composer actions and bounded upward input growth                                  | User requested model/attachment controls level with Send and room for longer input |
| 2026-11-04 | Refine chat bubbles, reasoning disclosure, composer and consistent lightweight icons         | User requested a more contemporary conversation surface                            |

Native file restore uses the SDK confirmation with application-specific consequence text: the whole shared file changes, later revisions remain available, and active Copilot work stops. The application does not restyle SDK History UI internals.

At every screen size, opening native history temporarily hides Copilot without changing its expanded/collapsed preference; closing history restores its previous state. The native sidebar close action remains available. Doc restoration recreates only the editor after ACK; chat and its draft stay mounted.

Model management belongs to the composer model menu, with an additional setup action only in an empty conversation when a key is needed. The file header keeps file-related controls; omit the separate model-settings and sign-out icons while no account-management surface exists. Show the online count only when another collaborator is present.

Model selection separates the actual model from reasoning effort. For DeepSeek, use provider-discovered names and IDs, context and input capabilities; show the selected effort beside the compact model label when space allows. A Reasoning effort submenu offers only supported levels plus Off. Model/effort changes apply to subsequent requests, preserve the draft and page key, and remain disabled during a run. Discovery failure keeps the configured model usable and offers retry rather than inventing a version or capability.

## Conversation picker · 2026-11-04

The current conversation title acts as a compact header dropdown, with New and Share as icons. The mode menu lives in the composer beside the model picker, following the placement shown in [Shortcut's official interaction examples](https://shortcut.ai/changelog/whats-new). The list uses the existing white/graphite surfaces, recent-date groups, a selected check, and one More menu per conversation. Search matches titles and messages within the current file. Keep the editor visible behind the popover, contain keyboard/programmatic focus while it is open, and retain bounded widths on a narrow panel. New conversations share the same file; draft/context isolation and running-task continuity make switching predictable. Do not add file-name chips, redundant headings or a second workspace sidebar for conversations.
