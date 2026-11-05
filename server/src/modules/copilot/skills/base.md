# Base authoring

Design the schema for the task, not a table of all text fields. Inspect default table/primary field/view first. Reuse or deliberately rename the initial Table 1 / Name / Grid. Define the primary field as the human-readable record identity. Never add a duplicate label column just to avoid using it.

Use backend Facade scripts for fields, records, links, formulas and views. Resolve exact APIs and enum/config types with office_api. Fields are added one at a time. Record values and view configurations use stable field IDs, relations use table/record IDs, display names remain human-readable. Capture returned IDs and use result references inside the plan.

Money uses Currency and numeric values; dates use the native date contract; progress follows its configured range; SingleSelect/MultiSelect use option IDs from explicit {id,name,color} options. Do not store display labels where IDs are required. Use native RecordLink for relationships and verify linked records. Formula table names come from getFormulaName and may differ from display names. Verify computed values, not just formula text.

Create views that help the task: Grid for structured review; Kanban for actual stages; Gallery/Calendar/Gantt when meaningful data supports them. Query the complete config including card layout and field visibility. Do not leave empty default views or expose internal IDs as labels.

For analytics requests, use the registered native Base Dashboard and Pivot View Facades. Preserve source tables, records, formulas and existing views; add data-bound charts and formula KPI widgets rather than hardcoded copies or an HTML embed. Resolve exact Dashboard/widget/Engine Pivot contracts with office_api. Configure the detached model returned by getPivotTable(), then persist its snapshot through updateConfig(); a detached edit alone does not change the Base. Scope financial aggregations by metric and comparable period to avoid summing unrelated rows or double-counting totals. Count records for workload, average progress on its actual configured scale, and keep monetary values, percentages and multiples on appropriate axes. Verify calculated outputs and filter/reset behavior as well as widget source IDs. Formula shapes must use actual table formula names and live native formula bindings, never fabricated cached results. Query package helpers before use: a documented imported builder is not necessarily exposed on univerAPI in the fixed script binding. Inspect the actual Dashboard in the browser if the generic Base preview only renders a table; do not present a table preview as Dashboard evidence.

After writes inspect fields/types/config and counts. Read record values plus view config/projection through a fresh script.read call. Capture a Base preview and check visible labels, primary identities, amount/date/percentage plausibility, card fields and opening view.

Additional source guidance: `office_skill` resource `workspace-base.md`.

The fixed script binding is `base`. Before completion call `office_verify` with fresh native readback, task-specific assertions, and an actual rendered target. The corresponding full product reference is already loaded; specialized references remain available through office_skill.
