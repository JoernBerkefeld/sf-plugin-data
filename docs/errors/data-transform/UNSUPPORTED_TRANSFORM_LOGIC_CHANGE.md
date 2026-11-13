# `UNSUPPORTED_TRANSFORM_LOGIC_CHANGE`

> The update changes the transform logic, but only label and description can be updated. Revert the logic in the file, or create a new transform with --transform-operation create.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

For `--transform-operation update`, the plugin compares the nodes in your file with the transform in the org. They differ: the source DLO, field, output DLO or mapping changed.

## Why the plugin stops

Changing the logic of an existing transform can change which data it loads into which DLO. The plugin only updates label and description; changes to the load or output are refused.

## How to fix

1. To change only label or description, restore the logic from the org: retrieve the transform and copy over just the label and description edits.
2. For different logic, give the transform a new name and deploy it with `--transform-operation create`.
3. Rerun the deploy.

## Example output

```text
Deploy execution: blocked (UNSUPPORTED_TRANSFORM_LOGIC_CHANGE). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
UNSUPPORTED_TRANSFORM_LOGIC_CHANGE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The update changes the transform logic, but only label and description can be updated. Revert the logic in the file, or create a new transform with --transform-operation create.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_LOGIC_CHANGE.md
```

## Related codes

- [`TRANSFORM_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_IDENTITY_MISMATCH.md) — the target ID belongs to a transform with a different name.
