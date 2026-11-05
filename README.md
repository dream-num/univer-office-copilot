# Univer Office Copilot

An open-source Office copilot for creating and editing spreadsheets, docs, slides, relational tables, and canvases through conversation. Built with Univer Office SDK and LangChain, with real-time collaboration and bring-your-own-key model support.

This repository is an application reference: a small workspace, a real Office editor, and a conversation panel. It demonstrates how to connect a model's typed tools to the same collaborative document that people are editing.

## Run locally

Use **Node.js 24+** and **pnpm 10.33.4**.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173**. The local demo creates a private account with **seven editable example files** and opens the financial spreadsheet. Use **New** to create a Modern document, Paged document, presentation, relational table, or canvas. No Docker, cloud database, or AI account is required to open and edit files.

In the chat composer, open the model menu and choose **Add model** or **Manage models**, then select a provider, enter a model ID and your API key, and save the configuration. Empty conversations also offer a setup shortcut and two examples for the current product; selecting an example fills the input without sending it. Start in **Ask** to read a file or switch to **Edit** to modify it directly. Keys entered in chat stay in page memory and are sent only with the current request. Reloading the page clears those keys. Non-secret model profiles are saved on the server.

Supported configurations: **OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter, and custom OpenAI-compatible HTTPS endpoints**. The DeepSeek composer menu discovers live model names, API IDs, context sizes and image-input capabilities from the official `/models` endpoint. It separates model selection from **Off / Low / High / Max** reasoning; changes are saved to the profile and apply to subsequent requests. Model API aliases may follow provider updates; the displayed name is provider metadata, not a pinned snapshot guarantee. Other providers retain their own reasoning controls in model settings. Model IDs are editable; support for tool calling and public reasoning depends on the selected model. A connection test verifies text access, not every capability.

### Included examples

No AI key is needed to open, explore or manually edit the examples. A new local demo account receives independent native copies from [`examples/`](examples/):

| Example                                   | Product          | What to explore                                                        |
| ----------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| Sales                                     | Spreadsheet      | Sales budget, formulas and a native chart                              |
| Anthropic IPO · Financial Model           | Spreadsheet      | Financial statements, IPO scenarios, sensitivity and validation checks |
| Anthropic IPO · Financial Analysis        | Modern document  | Native Markdown content, tables and source references                  |
| Anthropic IPO · Investment Committee Memo | Paged document   | Physical pages, native tables and Typst-authored layout                |
| Anthropic IPO · Investor Presentation     | Presentation     | Editable SVG-authored slide elements                                   |
| Anthropic IPO · Financial Due Diligence   | Relational table | Linked records, three dashboards and fifteen live charts               |
| Anthropic IPO · Financial Decision Map    | Canvas           | Editable shapes, evidence cards and bound connectors                   |

Only the latest file contents and Modern Doc authoring maps are bundled. Conversation messages, provider reasoning, previous versions, accounts, share links, attachments, model profiles and credentials are excluded. Every imported file starts with a new identity, owner and revision one. Existing accounts and files are never reset; deleting or changing an example does not trigger reseeding on refresh. Set `DEMO_EXAMPLES=false` in your local environment to start with a blank spreadsheet instead. Normal account registration and login never seed example files.

These are demonstration cases with a November 5, 2026 data cutoff. Historical disclosures and illustrative scenario assumptions remain identified inside each case; the snapshots are not maintained as a live financial data feed.

### Optional local DeepSeek configuration

Copy [`.env.example`](.env.example) to `.env.local`, then put your own values in that local file:

```dotenv
DEEPSEEK_API_KEY=your-own-key
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_REASONING_EFFORT=high
```

Restart the service after changes. In local `DEMO_MODE=true`, the app creates a DeepSeek profile if none exists and uses the server key when a chat request has no page key. Existing profiles stay editable in chat; `DEEPSEEK_MODEL` and `DEEPSEEK_REASONING_EFFORT` initialize new profiles. The explicit effort setting takes priority over the legacy `DEEPSEEK_THINKING` flag. Refreshing the page keeps the local model usable. The settings field stays empty and shows that a local server key is configured. A key entered in chat takes priority until reload.

The key stays on the local server; it is never returned to the browser or saved in application databases, conversations or exports. `.env.local` and `.env` are Git-ignored; only the empty `.env.example` belongs in the open-source repository. The server-key fallback is disabled when `DEMO_MODE=false`. Remote users continue to bring their own keys through chat.

### Import and export

| Product | Import                | Export            |
| ------- | --------------------- | ----------------- |
| Sheets  | XLSX, XLS, CSV, TSV   | XLSX              |
| Docs    | DOCX (Paged document) | DOCX              |
| Slides  | PPTX                  | PPTX              |
| Base    | XLSX, XLS, CSV, TSV   | XLSX (table data) |
| Board   | Univer JSON           | Univer JSON       |

All five products also support portable **`.univer.json`** backup and reimport. This sample format preserves native content and Doc authoring maps, with a new file identity on import. It excludes permissions, history and conversations, and is distinct from the CLI's `.univer` package. Choose JSON to retain Base views and application-specific objects. Office conversion can change unsupported formatting. Imports are limited to 20 MB. Export waits for pending local edits to save and requires read access.

Office conversion uses the public `@univerjs-pro/exchange-node` adapter. Its Free export quota is available without a server license pair; quota and licensed policies are enforced by the SDK. JSON backup remains available when an Office export is unavailable.

### Chat attachments

Use the composer's paperclip to **Upload files** or **Add from workspace**, or drag local files onto Copilot. Attach up to five files per message, including workspace references, at 20 MB per upload. Uploads process sequentially while the draft remains editable. Cards show real upload/processing states, format and size, image thumbnails, preview, retry and removal. Sent messages retain their attachment cards.

- **PDF, PNG/JPEG/WebP/GIF, Markdown and UTF-8 text** are private conversation resources. PDF previews show extracted text; PDF input is limited to 100 pages and 200,000 extracted characters. Scanned PDFs need OCR elsewhere. Text/Markdown share the character limit. Animated images use their first frame. Images require an image-capable model with **Enable image input** selected; the sample does not infer vision support from a model name.
- **XLSX/XLS/CSV/TSV, DOCX, PPTX and `.univer.json`** import into the workspace and attach as read-only native references. Importing from chat leaves the current file open. Copilot can inspect attached files; direct editing still targets only the current file.

Draft attachments stay with their original conversation when switching chats; drafts clear on page reload. Successfully uploaded resources remain private with the conversation, and deletion of that conversation deletes them. Removing a draft card detaches it without deleting its stored upload or an imported workspace file. Follow-up turns can read attachments in the recent conversation context. Public conversation snapshots exclude attachment cards and private downloads; shared reply text can still contain information the model quoted or summarized from a file.

### Univer licensing

The application source is Apache-2.0. Some embedded Univer products, collaboration, history, and Office conversion use **Univer Pro packages with their own licensing terms**. Open-source application code does not grant an SDK license. Without a license, the SDK's built-in trial restrictions and watermarks remain visible.

For a local Office runtime license, set `UNIVER_CLIENT_LICENSE` in `.env.local` and restart the app. This configures the browser and headless Office worker. Both `pnpm dev` and `pnpm start` load `.env`, then `.env.local`; local values are Git-ignored. When a Collaboration or Exchange server license is needed, set its separate `UNIVER_LICENSE` and `UNIVER_LICENSE_KEY` pair. Those server values are never returned to the browser. Keep actual model keys in the Git-ignored `.env.local` or page memory; `.env.example` must contain no secrets. See [SDK integration notes](docs/sdk-notes.md).

## How it works

- **Workspace:** create five file types, folders, rename/move files, search, recycle bin, and recover. Customize individual file icons with searchable emojis in Manage file, or restore the product default. Import files from the New file menu; export the current file from the header download action.
- **Copilot:** a per-file conversation picker with new chats, title/message search, recent-date groups, rename and delete. Each chat keeps its own draft, attachment context and Ask/Edit preference; the current browser tab remembers the selected chat across reloads. You can switch away from a running chat and return to its progress. A notice prevents starting another task against the same file while it is busy. Private conversations, streaming responses, collapsible provider-supplied reasoning, Ask/Edit modes, cancellation, and per-turn confirmed modifications. Expand an edit to inspect SDK-computed before/after values, with cell addresses and paged details. Owners can restore the whole file to before one edit or the turn; confirmation explains the effect on later edits, and concurrent changes are rejected. Chat and drafts survive restoration.
- **Direct editing:** tools update the current shared file through a headless Univer client. A collaboration ACK confirms a modification; the browser receives it through normal collaboration. There is no Apply button.
- **History:** open Univer’s native history viewer in all five editors, select a read-only version and confirm a whole-file restore. The viewer owns the list, preview, differences and restore controls. Restoration is restricted to the owner and checks concurrent changes. Copilot is temporarily hidden while history is open, with its conversation, draft, width and expanded/collapsed preference preserved. Closing history restores that previous state.
- **Sharing:** invite an existing account as Viewer/Editor, publish a revocable read-only file link, or publish a separate conversation snapshot. Conversation publication excludes reasoning, internal tool payloads, keys, and future messages.

The agent loads bundled product skills and uses Univer AI SDK for version-matched API lookup, structured inspection, SVG compilation, visual resources, screenshots and layout checks. Modern Docs use the official Markdown compiler, including current-native selected-block reads/updates; Traditional Docs use the official Typst compiler for physical pages; generated Slides use browser-measured SVG compiled into editable elements. CLI-equivalent backend JavaScript scripts enable loops, functions and native Facade editing across all five products inside a bounded QuickJS VM. Changes flow through the headless collaborative client, never a second browser-side AI mutation. Completion requires fresh native assertions and rendered evidence at the saved head; failed checks feed the repair loop. See [AI authoring](docs/ai-authoring.md) for capabilities and limits. Select **Enable image input** only for an image-capable route.

AI text measurement and rendered checks require a locally installed Chrome, Chromium or Edge. The SDK discovers common installations; set `UNIVER_RENDER_BROWSER` to an explicit executable when needed. Opening and manually editing files does not require the render browser. The local sample serializes render work in one browser; production isolation requirements are described in the authoring guide.

## Architecture and extension guides

- [Architecture](docs/architecture.md): runtime, module dependencies, and AI edit sequence; module/data ownership.
- [AI authoring](docs/ai-authoring.md): skills, native content paths, AI SDK modules, rendering and quality checks.
- [Design system](DESIGN.md): shared neutral panels, product accents, typography, and collapsible workspace behavior.
- [Application UI](docs/ui-system.md): Tailwind/Radix components, form and popup conventions, and SDK style isolation.
- [Adding a product or tool](docs/extending.md): adapter and contract extension points.
- [SDK notes and validation limits](docs/sdk-notes.md): version pins, upstream declaration issues, and licensing.
- [Office feature matrix](docs/office-features.md): native Ribbon layouts, product plugin profiles, and service requirements.
- [Development status](docs/status.md): implemented scope and remaining validation.

```text
web/src/features/       React feature modules; editor and chat UI adapters
server/src/modules/     Authentication, files, conversations, attachments, providers, copilot
server/src/office/      Univer SDK adapter, product actions, one worker
shared/src/             Validated wire contracts; no server or SDK objects
```

## Checks and production build

```sh
pnpm check
pnpm build
pnpm test:production
pnpm start
```

`pnpm check` runs strict application type checking, architecture checks, and tests. Tests build only the dedicated Render Page and use the local render browser for real PNG checks. Integration tests use temporary databases, the real Office SDK, and a deterministic model fixture; they do not spend API credits. Office export roundtrips consume SDK conversion quota and run only when explicitly enabled with `TEST_OFFICE_CONVERSION=true pnpm exec vitest run server/tests/transfer.integration.test.ts`. Native JSON and import tests remain in the default suite. After building, install a browser once with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. Browser tests run sequentially and start the compiled app automatically. Set `E2E_BASE_URL` to test an already-running app, or `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome.

`pnpm build` builds only this app's web entry, Node entries, bundled skills and Render Page. `pnpm start` serves the application on **http://127.0.0.1:3100**. Data is stored in `.data/` as application, collaboration, and history SQLite databases; generated previews and downloaded catalog assets stay alongside them. Back up the three databases and document-maps directory together while the app is stopped.

Local demo mode is restricted to loopback. Before exposing a deployment, set `DEMO_MODE=false`, use HTTPS, and review authentication, model endpoint policy, storage, rate limits, and SDK licensing for your environment. This sample runs in one Node process; it does not implement distributed locks or a hosted account service.

## Contributing

Read [AGENTS.md](AGENTS.md). Keep vendor runtime imports inside their adapters and update architecture documentation when boundaries change. PR descriptions should be in English and follow the repository template. Do not commit `.env`, databases, credentials, generated bundles, or submodules.
