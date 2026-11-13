# `TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED`

> Creating or updating a data transform starts processing in Data Cloud. Add --allow-processing to confirm, then rerun; nothing was changed.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The deploy would create a transform or change an existing one, and `--allow-processing` was not passed. If the org already matches the file, the deploy reports `unchanged` and does not need this flag.

## Why the plugin stops

A created or updated transform is processed by Data Cloud after the write. The plugin wants you to accept that explicitly before it sends the change.

## How to fix

Rerun the same deploy with `--allow-processing`.

## Example output

```text
Deploy execution: blocked (TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Creating or updating a data transform starts processing in Data Cloud. Add --allow-processing to confirm, then rerun; nothing was changed.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED.md
```

## Related codes

- [`TRANSFORM_SERVER_PROCESSING`](../data-transform/TRANSFORM_SERVER_PROCESSING.md) — reported after the write when Data Cloud is still processing.
