# `TRANSFORM_DELETE_IDENTITY_MISMATCH`

> The data transform list has no entry with the resolved ID and name together. Nothing was deleted; the transform changed during the run, so preview the delete again, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The plugin resolved the transform's record ID from its API name, then read the full list of data transforms again and did not find one row with that ID and that name together. The transform may have been renamed, removed or replaced while the delete ran.

## Why the plugin stops

The ID decides what gets deleted, and the name is how you selected it. The plugin only deletes when both point to the same transform in the org.

## How to fix

1. Look up the transform in Data Cloud and check that its API name is the one you selected.
2. Wait until nobody is changing transforms, then run the delete with `--preview` again.
3. Rerun the delete.

## Example output

```text
Delete: blocked.
Blocked: data-transform:Orders_Copy; mutation: not-attempted.
TRANSFORM_DELETE_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The data transform list has no entry with the resolved ID and name together. Nothing was deleted; the transform changed during the run, so preview the delete again, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DELETE_IDENTITY_MISMATCH.md
```

## Related codes

- [`INCOMPLETE_TRANSFORM_INVENTORY`](../data-transform/INCOMPLETE_TRANSFORM_INVENTORY.md) — the list itself could not be read completely.
- [`TRANSFORM_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_IDENTITY_MISMATCH.md) — the record read by ID or name belongs to a different transform.
