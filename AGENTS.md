# Univer Office Copilot

This is an application sample, not a fork of Univer Workspace or a new SDK.
Read README.md and docs/architecture.md before changing module boundaries.

- Use TypeScript, named exports and explicit module composition.
- `web`, `server`, and `shared` are separate packages. Browser code must not import server code. Shared contracts must not import either application or vendor runtime objects.
- Feature modules expose an `index.ts`. Do not import another feature's repository or internal implementation.
- Browser Univer integration belongs to `features/editor/univer`; server SDK integration belongs to `office`. Provider adapters belong to `modules/providers`; the LangChain agent loop belongs to `modules/copilot`.
- Office content is authoritative in the Collaboration SDK. Copilot events update presentation and history associations; never apply an AI edit a second time in the browser.
- Keep all version-coupled Univer packages pinned to one public release. Do not depend on sibling checkouts, private source paths, or submodules.
- Do not modify Univer UI or Design internals, hide license restrictions, commit credentials, or add co-author trailers.
- Run only this application's relevant builds and tests. Keep one application server and one Office worker.
- Keep architecture diagrams, directory descriptions, and extension guides consistent with code. Report unverified capabilities honestly.
- Do not commit, push, create a remote repository, or publish without an explicit request. PR text must be English and follow `.github/pull_request_template.md`.

## Design system

Read DESIGN.md before visual or interaction changes. Keep shared colors, typography, density, and panel behavior consistent with that document. Subsequent user design requests authorize updating the design system; do not introduce a separate confirmation step for already requested changes. Keep application styles separate from Univer UI/Design internals.

Use the shared Tailwind 4/Radix controls in `web/src/components` for application forms, menus and dialogs. Tailwind uses the `app:` prefix and excludes Preflight; keep that boundary intact. Do not add global input/select/label rules or browser prompt/confirm flows. Read `docs/ui-system.md` before adding another control. Feature layout CSS remains scoped to application classes.
