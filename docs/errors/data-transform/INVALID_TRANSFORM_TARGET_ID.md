# `INVALID_TRANSFORM_TARGET_ID`

> The data transform record ID has the wrong format. Use the 18-character ID starting with 1dt from the org, then rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data transform                           |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

An update or delete was about to be sent for a transform ID that is not `1dt` followed by 15 letters or digits. A deploy checks the `--transform-target-id` flag earlier and a delete takes the ID from the transform list, so this code is normally a second line of defence.

## Why the plugin stops

Updates and deletes are sent to a URL built from the ID. The plugin never builds that URL from a value it cannot recognise as a data transform ID.

## How to fix

1. Look up the transform record ID in Data Cloud or from the `id` of a previous retrieve.
2. Pass it unchanged with `--transform-target-id`.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (INVALID_TRANSFORM_TARGET_ID). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
INVALID_TRANSFORM_TARGET_ID: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The data transform record ID has the wrong format. Use the 18-character ID starting with 1dt from the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_TARGET_ID.md
```

## Related codes

- [`INVALID_TRANSFORM_DEPLOY_SELECTION`](../data-transform/INVALID_TRANSFORM_DEPLOY_SELECTION.md) — the deploy flags are missing or contradictory.
- [`INVALID_TRANSFORM_DELETE_SELECTION`](../data-transform/INVALID_TRANSFORM_DELETE_SELECTION.md) — the delete selector does not name one transform exactly.
