# Editable example snapshots

These six `.univer.json` files contain the current, native file contents used by the local demo. See the [case catalog](../README.md#included-examples) for descriptions.

They use the application's portable native format, not database backups. New demo accounts import private editable copies through the normal Files API; each copy starts at revision one with a fresh file and Unit ID. The Markdown document includes its compiler authoring map so later edits can address native blocks. Paged Docs, SVG-authored slides, live Base pivots and Board connector bindings remain native.

The examples contain no conversations, provider reasoning, model profiles, credentials, previous file versions, account records or sharing grants. `.data/`, `.env.local` and the generated research/report artifacts in `output/` stay local and are not required to run the cases. Configure your own provider in Copilot before generating new content.

The financial material is an illustrative case library with a November 5, 2026 cutoff; scenario inputs and disclosure sources are identified in the files.

To update a case, export its latest native JSON through the app, verify it with a fresh import, and replace only the corresponding snapshot. Keep authoring maps where present and exclude account or conversation data. Runtime imports regenerate identities and revision numbers.
