# Application UI

The application uses **Tailwind CSS 4**, **Radix Primitives**, CVA and a small shared component set. Office editors and their official History viewers keep native Univer styles and themes. The application no longer renders its own file-version dialog.

## Style boundary

- The Vite integration imports Tailwind's theme and utilities, with the `app:` prefix. Only `web/src` is scanned.
- Preflight is intentionally omitted: a global form reset would also affect embedded Office controls. Do not import the full `tailwindcss` stylesheet or add unqualified `input`, `select`, `label` or control-font rules.
- `styles.css` owns the app shell, feature layouts, the composer and panel interactions. Shared control appearance belongs in `components`, using prefixed utilities.
- `cn()` understands the Tailwind prefix and merges utility overrides. Use CVA for Button variants rather than duplicating buttons' appearance in feature modules.

While `.app-shell` is mounted, scope root/body viewport locking and `overscroll-behavior: none` through `:has(.app-shell)`. The shell's own height limit alone does not disable browser-level trackpad bounce or horizontal navigation gestures. Application scroll areas use `overscroll-behavior: contain`; native Office canvases retain their wheel/touch handling. Do not add global wheel cancellation or `touch-action: none`, and do not lock standalone shared conversation pages.

## Shared components

| Component                                  | Responsibility                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `Button`                                   | Primary, secondary, ghost and destructive actions; three sizes and consistent keyboard focus            |
| `Input`, `Field`, `Checkbox`               | Labeled, scoped form controls; visible focus and disabled states                                        |
| `Select`                                   | Controlled string choices, a 12px arrow gutter, keyboard/typeahead support and viewport-bounded options |
| `MenuContent`, `MenuItem`, `MenuRadioItem` | Shared popup padding, row density, check alignment and focus states                                     |
| `Dialog`                                   | Viewport-bounded surface, consistent header/body insets, internal scrolling and focus management        |
| `TextEntryDialog`                          | Reversible text entry, validation errors and pending submission                                         |
| `ConfirmDialog`                            | Explicit confirmation for delete/trash/restore, safe default focus and pending/error states             |
| `Popover`                                  | Portalled, viewport-bounded emoji and conversation pickers                                              |
| `Tooltip`                                  | Shared hover/focus descriptions, collision bounds and disabled-control hover support                    |

Do not use browser `prompt` or `confirm` for application flows. Keep meaningful warning text and preserve the existing server checks. AI edits still apply directly; human management dialogs do not add an AI draft/review step.

Keep action errors in the dialog where the action was started. Empty lists should explain what is empty. Truncate long selectable names with their full value available on hover; let descriptions and metadata wrap. File versions separate the version/status line, modification summary, actor/time and actions.

Icon-size `Button`s use their accessible name as a tooltip by default. Set `tooltip` when the action needs more context; keep `aria-label` concise and stable. Text buttons may opt into a tooltip. Do not rely on native `title` alone, remove visible field labels or put essential confirmation/error text behind a tooltip. Avoid repeated file names, headings and instructional paragraphs in Copilot. An empty conversation shows two product-specific example prompts and a model-setup action when a key is missing; selecting a prompt fills and focuses the composer without sending. Hide this welcome once a draft or messages exist. Model management stays in the composer menu, and the file header has no separate model-settings or sign-out icon. Display actual context and running status only when they apply.

The composer puts the Ask/Edit mode menu, model/context tools and Send/Stop in one bottom row. Reuse the shared Radix radio menu for mode, showing the current word and a chevron in its trigger, with a short consequence description per choice. Keep mode visible at narrow widths; let model text truncate to preserve all actions. Switching mode preserves the draft and the existing per-conversation preference; execution/history temporarily disables the trigger, and viewers cannot select Edit. Use assistant-ui's existing autosizing input with two minimum rows, ten maximum rows and a viewport-height cap. The form stays anchored while the conversation area gives up space. A width observer refreshes only the input when the panel resizes; it does not remount the draft, broadcast a global resize or rerender the message list.

Running feedback belongs after the current assistant message. Show it immediately while awaiting a response, then derive Thinking/Responding/Reading/Updating from actual stream and tool events. Show the completed turn's modifications as a compact icon-and-text “View changes” button, rather than an icon alone. Hide it until the run ends. Reasoning is provider-supplied text, collapsed by default; an expanded block has its own bounded scroll area so it cannot displace the whole conversation.

Per-turn modifications use a wide shared Dialog with expandable revision rows. Expanding a row loads the materialized versions immediately before and after that revision and prepares the native SDK semantic comparison once. The editor adapter translates SDK labels and returns SDK-free pages of 50 items; the Copilot feature owns the accordion and before/after presentation. Show cell addresses, useful content labels, loading, retry and Show more states. Restore actions remain visible in a separate fixed footer. Owner-only restoration uses the existing journaled Files API with a freshly checked head revision, explicit whole-file consequences and safe Cancel focus; a concurrent write is rejected. After an acknowledged restore, recreate only the editor while preserving chat and draft. Native file history remains the full visual viewer and recovery path.

The chat adapter uses assistant-ui's unstyled primitives; the application owns its appearance. User messages are right-aligned neutral bubbles, assistant replies remain on the panel surface, and role names stay available to assistive technology without repeated visible headings. The “Thought process” disclosure uses a trailing chevron and a neutral guide beside its scrollable text. Loading uses three small opacity-pulsing dots, with static dots under reduced motion. Composer actions share 32px targets, consistent Lucide strokes and the existing semantic tooltips. Model selection has no nested outlined chip; Send/Stop share one circular position. These styles remain in the scoped application stylesheet and do not modify SDK controls.

Assistant replies use assistant-ui's Markdown renderer with GFM tables, semantic lists, code and links. Markdown typography stays under `.message-markdown`. Only authenticated Office preview paths can render as inline images; arbitrary remote images display their alternative text without an external request. The image-input setting is an explicit provider-route capability, not a claim inferred from its name. Skill/API/source/resource requests report preparation; actual visual requests report layout checking.

`copilot/attachments` owns the local-upload queue, workspace picker, file cards, drop state and shared preview dialog. The paperclip uses the shared Menu and file selection uses the browser chooser. Local Office files use the existing Files import API; PDF/images/Markdown/text use private conversation uploads. Both paths share a five-file composer limit and sequential processing. A removed pending card cannot reappear when its request finishes. Failed cards remain removable/retryable; sending waits for successful preparation, but typing and chat switching remain available. File drag events are handled only in Copilot; text dragging and native editor gestures are unaffected. Shared `components/product-icon.tsx` supplies product identity in both workspace and attachment cards.

Previews use authenticated, normalized image URLs or escaped extracted text, never uploaded HTML/Markdown execution or embedded PDF scripts. Cards and dialogs report scanned PDF limitations explicitly. The composer has a bounded attachment scroller; sent-message cards remain visible with that message. Use the same shared buttons and dialogs for keyboard focus, retry, removal and preview/download. Images require the profile's explicit **Enable image input** capability.

## Verification

The Sheets host initializes the active sheet's public render service before remote range mutations when a worksheet replacement invalidated its previous render. This is an SDK 1.3.1 integration guard, not a second content write. The editor keeps its own stacking context at layer 1 so SDK notifications can appear above the adjacent Copilot surface while application dialogs retain their higher layer. `remote-sheet.spec.ts` covers backend worksheet replacement, formula readback, a genuine peer restore notice and its reload action.

The Playwright suite checks all five editor hosts, collaboration, versions, keys, panel controls and the chat adapter. `ui-polish.spec.ts` adds desktop/mobile spacing, dropdown focus and gutters, inline errors and cancellable file/conversation management. `copilot-controls.spec.ts` covers semantic hover/focus tooltips, Escape inside a dialog, modes, selection context, draft preservation, compact header bounds and the composer's action alignment, upward growth, scrolling cap, shrink and width-dependent wrapping. Browser assertions use the same accessible controls people operate. UI transport fixtures never call a paid model API.

References: [Tailwind without Preflight](https://tailwindcss.com/docs/preflight#disabling-preflight) and [Radix Select](https://www.radix-ui.com/primitives/docs/components/select).

File transfer uses the shared Dialog, Field, Input, Select and Button controls. Import is available from New file in the collapsed rail and expanded sidebar; export is one header icon with a semantic tooltip. The dialogs retain errors and selection during a failed request, disable duplicate submissions, and show pending conversion labels. Selecting an Excel/CSV/TSV file exposes Sheet/Base as the import target; native JSON detects its own product.

In local demo mode, a server-configured DeepSeek profile works after reload without a page key. Model menus suppress the missing-key icon for these profiles, and the settings password field stays empty with a local-server configuration placeholder. Entering a page key overrides the local fallback; no endpoint returns the environment credential.

File icons use the MIT-licensed [emoji-picker-react](https://github.com/ealush/emoji-picker-react) inside the shared Radix Popover. The picker loads only when opened, uses bundled data and native glyphs, and keeps its search, categories and keyboard navigation. App-owned CSS variables match the graphite palette without modifying Univer styles. Choose an emoji or Use default icon in Manage file, then Save changes. Pending choices stay local to the dialog; cancelling does not mutate the file. The selected emoji renders as text with a fixed square footprint in the rail, file list and title.

The shared `ProductIcon` uses app-owned color tokens for Sheet green, Doc blue, Slide orange, Base purple and Board teal. The same tokens apply to creation, navigation, title and default-icon previews; both document flavors share the Doc color. Keep product color on the icon, retaining only the existing Sheet-name accent. Panels, menu text and selection backgrounds use the shared neutral palette.

Pass each file's `documentFlavor` to `ProductIcon`: Modern documents use `NotepadText`, while Paged (`traditional`) documents use the folded-corner `FileText`. The same distinction applies in the New file menu, rail, expanded list, title and Manage file preview. An explicit emoji overrides either default.

The composer model menu follows the Harness model/effort separation using the shared Radix menu and submenu surfaces. DeepSeek metadata loads once per selected credential/profile and is cancelled on unmount/change. Names, API IDs, context windows and input modalities come from the official model list. Selecting a model saves that profile; selecting Off/Low/High/Max saves an explicit reasoning preference. A new text-only model turns off image previews; switching to an image-capable model does not enable previews automatically. Manual IDs remain available in settings, with Find models as an authenticated discovery action. Empty/failed discovery keeps the current profile visible and offers retry.

## Conversation management

The right panel keeps the current conversation title, New conversation and Share in one compact header. Ask/Edit lives in the composer beside the model picker. The title is the switcher, with its full name in a semantic tooltip. It replaces the separate history icon and does not repeat the file name. Opening it shows a viewport-bounded Radix Popover with search, new conversation, recent-date groups, current-selection check and per-row More menus for Rename/Delete. Search includes private message text and shows a short matching snippet. Results paginate with the existing stable time/ID cursor and retain inline error/retry states.

Use modal focus containment for this popover without a visual backdrop: native editor initialization can request focus while search is open. Focus stays in the picker, while Escape and an outside pointer dismiss it. More menus sit above the picker; opening a management dialog closes it, and finishing/cancelling returns to the list. Delete keeps the existing explicit confirmation and does not alter the shared file or its versions. A running chat cannot be deleted.

Switching creates no file snapshot or restore. Chat drafts and attachment/selection context are kept separately in page memory for the mounted file; refreshing clears drafts. Ask/Edit preferences persist on the server, and only the last selected conversation ID is stored in tab session storage. The current title refreshes after generated replies and rename actions. Deleting the selected chat opens another existing chat, creating a blank one only if none remain.

A running task stays associated with its original conversation. The per-file chat store retains received deltas when reopening it. In another chat, show a small running-task notice with Open; the composer waits while the same file is busy. This does not cancel the task or reapply any Office change. No API key, draft text or Office content is added to browser persistent storage.

Reference pattern: [Shortcut's chat-history search](https://shortcut.ai/changelog/whats-new) searches titles and messages. This sample deliberately scopes the picker to the current file and authenticated owner.
