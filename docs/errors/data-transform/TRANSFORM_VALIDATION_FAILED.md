# `TRANSFORM_VALIDATION_FAILED`

> Salesforce validation rejected the new data transform, or its answer could not be read. Nothing was created; check the definition and DLOs in Data Cloud, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before creating a transform, the plugin sends the definition to the Salesforce validation endpoint. The answer listed one or more issues, or was not the expected shape. Validation only runs for a real create, not for preview or update.

When Salesforce lists issues, the message shows them: each issue's code and, when it passes the plugin's display filter for Salesforce texts, its message (at most three, then how many more). Common issues:

- `INVALID_DATA_TRANSFORM_DATA_OBJECTS` "Output objects … are already in use": another transform already writes that output DLO. A DLO has only one writing transform, whatever the data space, so a copy of a transform into another data space (`--allow-cross-dataspace`), which keeps the DLO names, fails while the source transform exists. Give the copy another output object, or delete the source transform first.
- `INVALID_DATA_TRANSFORM_DEFINITION` "There's a syntax error in the filter node …": a SQL filter (`sqlFilter`) refuses `<>`, write `!=`. A syntax error at `&` points to an HTML-escaped expression (`&gt;`, `&#39;`); Salesforce never decodes them. The plugin asks Salesforce for plain text, so retrieve writes expressions as stored, and deploy refuses an expression holding an entity outside texts before sending (`UNSUPPORTED_TRANSFORM_INPUT`): write the character itself.

## Why the plugin stops

Creating a transform that Salesforce already flags as invalid would leave a broken definition in the org. The plugin stops before the create.

## How to fix

1. Read the issues in the message.
2. Check that the DLOs and fields the definition reads and writes exist, and that no other transform writes the output DLO.
3. If no issue text is shown, try building the same transform in Data Cloud to see the validation messages there.
4. Fix the `.dataTransform.json` file or the DLOs, then rerun the deploy.

## Example output

```text
Deploy execution: blocked (TRANSFORM_VALIDATION_FAILED). No automatic retry or rollback performed.
Failed: data-transform:ds2_Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_VALIDATION_FAILED: Salesforce validation rejected the data transform ds2_Orders_Copy: INVALID_DATA_TRANSFORM_DATA_OBJECTS: Output objects Orders_Out are already in use. Select a different object or create a new one for this data transform’s output. Nothing was created. Deployment was refused before any write; nothing was sent to the org. Fix the reported cause, then rerun.
Hint: Salesforce validation rejected the new data transform, or its answer could not be read. Nothing was created; check the definition and DLOs in Data Cloud, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_VALIDATION_FAILED.md
```

## Related codes

- [`TRANSFORM_PREVIEW_LIMITATIONS`](../data-transform/TRANSFORM_PREVIEW_LIMITATIONS.md) — preview reports that this validation has not run yet.
- [`TRANSFORM_DEPLOY_FAILED`](../data-transform/TRANSFORM_DEPLOY_FAILED.md) — the create itself was rejected with an HTTP error.
