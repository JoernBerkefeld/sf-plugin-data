# `CI_FRESH_ADMISSION_BLOCKED`

> The last check right before writing the calculated insight gave a different result than the plan. Nothing was sent; rerun deploy with --preview and review the plan.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Calculated insight              |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Deploy checks every item once while planning, then checks it again right before the write. This code means the second check of a calculated insight no longer allowed the planned create or update, or `--allow-processing` was missing for a create or update.

The deploy result shows this item under `DEPLOY_FRESH_ADMISSION_BLOCKED`.

## Why the plugin stops

Something changed between planning and writing, in the org or in the local files. Writing on the old plan could overwrite a change made in the meantime.

## How to fix

1. Rerun the deploy with `--preview` and review the planned outcome.
2. Add `--allow-processing` for a create or update.
3. Make sure no one else changes the calculated insight or the local pair during the deploy, then rerun.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: calculated-insight:ExampleInsight__cio; mutation: not-attempted.
CI_FRESH_ADMISSION_BLOCKED: Fresh input or dependency admission failed before this item. No further writes were attempted.
Hint: The last check right before writing the calculated insight gave a different result than the plan. Nothing was sent; rerun deploy with --preview and review the plan.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_FRESH_ADMISSION_BLOCKED.md
```

## Related codes

- [`DEPLOY_FRESH_ADMISSION_BLOCKED`](../general/DEPLOY_FRESH_ADMISSION_BLOCKED.md) — the deploy-level code for the same stop.
- [`PROCESSING_ACKNOWLEDGEMENT_REQUIRED`](../general/PROCESSING_ACKNOWLEDGEMENT_REQUIRED.md) — `--allow-processing` is missing.
