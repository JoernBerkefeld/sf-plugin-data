# `TRANSFORM_VALIDATION_FAILED`

> Salesforce validation rejected the new data transform, or its answer could not be read. Nothing was created; check the definition and DLOs in Data Cloud, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before creating a transform, the plugin sends the definition to the Salesforce validation endpoint. The answer listed one or more issues, or was not the expected shape. Validation only runs for a real create, not for preview or update.

## Why the plugin stops

Creating a transform that Salesforce already flags as invalid would leave a broken definition in the org. The plugin stops before the create.

## How to fix

1. Check that the source and output DLOs and the mapped fields exist and are active.
2. Try building the same transform in Data Cloud to see the validation messages there.
3. Fix the `.dataTransform.json` file or the DLOs, then rerun the deploy.

## Example output

```text
Deploy execution: blocked (TRANSFORM_VALIDATION_FAILED). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_VALIDATION_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Salesforce validation rejected the new data transform, or its answer could not be read. Nothing was created; check the definition and DLOs in Data Cloud, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_VALIDATION_FAILED.md
```

## Related codes

- [`TRANSFORM_PREVIEW_LIMITATIONS`](../data-transform/TRANSFORM_PREVIEW_LIMITATIONS.md) — preview reports that this validation has not run yet.
- [`TRANSFORM_DEPLOY_FAILED`](../data-transform/TRANSFORM_DEPLOY_FAILED.md) — the create itself was rejected with an HTTP error.
