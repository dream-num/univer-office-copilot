# SDK integration notes

Version-coupled `@univerjs/*`, `@univerjs-pro/*` and `@univer-cli/*` runtime packages are pinned to **1.3.1** and loaded through public exports. The independently versioned asset catalog `@univerjs-pro/cli-assets` is pinned to **0.1.0**. The Typst wrapper owns its independently versioned native binding (`1.0.0-insiders.20260723-c21613b`); do not force it to the runtime cohort version. This sample does not depend on sibling Univer repositories, source checkouts, or submodules.

## Host composition

- Sheets and Docs use browser presets. Slides, Bases, and Boards use explicit plugin composition.
- Sheets, Docs, and Slides use native `ribbonType: 'grid'` with tab headers and two-row groups. Bases uses its own workbench toolbar, and Boards uses canvas tools. The [feature matrix](office-features.md) lists their authoring profiles.
- Preset hosts configure the license, shared Drawing IO, and collaboration before feature UI starts. Shared License/Drawing entries from feature presets are omitted to keep one configured owner. Pro formula replaces the OSS engine under the same plugin name; do not register both in the worker.
- Merge nested locale bundles with `mergeLocales`, including model locales when a package owns text such as Slide placeholders. Import each registered feature's public stylesheet when that package publishes one.
- `appendSlide({ name })` uses a default title/body layout in this release. AI text pages use public `createSlideByLayout` with `SlidePageLayoutTypeEnum.Blank` and set text shapes to no fill/no stroke; otherwise inherited placeholders and default shape fills overlap the inserted content. The Slide browser host retains the native footer for zoom controls.
- The browser initializes the user's identity before loading a server Unit. Collaboration services replace the default authorization and undo/redo services. Pro shape UI plugins must start after those replacements are registered.
- Bases has a browser worker for formula evaluation. The headless Node worker uses an inline formula engine inside the isolated worker thread.
- Headless Facade extensions are imported explicitly alongside their registered model/resource plugins. Server builds externalize dependency subpaths as well as package roots; bundling a second copy of a Facade/runtime entry can produce duplicate service identifiers.
- The Node socket in 1.3.1 opens its URL directly. `TicketSocketService` obtains the endpoint's one-time session ticket on each connection/reconnection, then delegates socket creation to the SDK. This is application integration code, not a patch to the SDK.
- Node HTTP requests are normalized to the local SDK origin through its public HTTP interceptor. Authorization headers are added only when absent because `HTTPHeaders.set` appends a value in this release.
- `flush()` is the persistence barrier. The worker is not disposed before it receives an ACK. For Sheets, formula application is a separate barrier: wait on `getFormula().onCalculationResultApplied(15000)` after loading and after mutations, before reading calculated values or flushing/disposal. A collaboration ACK alone can still leave a dependent formula read as `null`.

## Document compilers

Modern and Traditional Docs use the official Markdown and Typst compiler packages. Compile and materialize full replacements in a disposable standard headless runtime before importing application-specific process-global Facade extensions; these extensions require services absent from the compiler runtime. Reuse the current collaborative Unit through the fixed-file adapter, reset only content through native OT, and confirm that reset before the compiler mutates its new body. Markdown partial edits export the current native block and retain the compiler execution source map, with generated paragraph identities checkpointed through native OT for SDK 1.3.1 replay. See [AI authoring](ai-authoring.md) for diagnostics, assets and source-map checkpoints.

## Type checking

The application uses strict TypeScript and checks all application source. `skipLibCheck` is enabled because the published 1.3.1 declaration cohort contains unresolved/internal type references, including `SheetViewModel`, `Charset`, shape `../src` references, and network request types. An adapter dependency also contains an incompatible Anthropic SDK declaration reference. No vendor declaration or runtime file has been patched locally. Re-evaluate this setting when upgrading the release cohort.

## Licenses and validation

The sample's source license is separate from the SDK's licenses. SDK authorization controls watermarks; the application does not hide or modify them. An authorized local development license can be supplied through Git-ignored `.env.local` as `UNIVER_CLIENT_LICENSE`. It reaches the browser through `/api/config` and is inherited by the headless Office worker. Development licenses have a rotation/expiry policy; update the local value when it expires.

The Collaboration and Exchange server license pair uses `UNIVER_LICENSE` and `UNIVER_LICENSE_KEY`. A browser development license is not that server pair. Server license material never reaches `/api/config` or the browser build. Only reuse another application's development license with authorization; this sample has no runtime dependency on that application or its checkout.

The five editor opening paths and server-side persistence paths are tested independently. Passing fixture tests does not validate a paid model's endpoint, reasoning support, or Office conversion license. See [development status](status.md).

Primary references:

- [Collaboration quick start](https://docs.univer.ai/server/collaboration/quick-start)
- [Server architecture](https://docs.univer.ai/server/architecture)
- [LangChain agents](https://docs.langchain.com/oss/javascript/langchain/agents)
- [LangChain streaming](https://docs.langchain.com/oss/javascript/langchain/streaming)
- [assistant-ui external store runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)

## File conversion

The pinned `@univerjs-pro/exchange-node@1.3.1` provides the documented Node conversion path used by `office/transfer.ts`. It is separate from DOM-oriented browser Exchange Client plugins. Sheet/Doc/Slide/Base Office roundtrips and all five native JSON roundtrips are covered by real SDK integration tests. Free export quota works without `UNIVER_LICENSE`/`UNIVER_LICENSE_KEY`; configure that pair only for the corresponding server policy. Never substitute the client runtime license for the Exchange server pair. Board Office conversion is not exposed by this Node release; use the native JSON envelope.
