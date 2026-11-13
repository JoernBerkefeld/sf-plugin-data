# `TRANSFORM_DELETE_IDENTITY_MISMATCH`

> The data transform list has no entry with this ID and name together. Nothing was deleted; check --transform-target-id and the file name against the org, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The plugin read the full list of data transforms and did not find one row whose ID equals `--transform-target-id` and whose name equals the name in your file. The ID may belong to a different transform, or the transform may have been renamed or removed.

## Why the plugin stops

The ID decides what gets deleted, and the name in the file is how you identified it. The plugin only deletes when both point to the same transform in the org.

## How to fix

1. Look up the transform in Data Cloud and compare its record ID and API name with the flag and the file.
2. Retrieve it again if the local file is outdated: `sf data360 retrieve --metadata data-transform:<Name>`.
3. Rerun the delete with the matching ID.

## Example output

```text
Delete: blocked.
Blocked: data-transform:Orders_Copy; mutation: not-attempted.
TRANSFORM_DELETE_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The data transform list has no entry with this ID and name together. Nothing was deleted; check --transform-target-id and the file name against the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DELETE_IDENTITY_MISMATCH.md
```

## Related codes

- [`INCOMPLETE_TRANSFORM_INVENTORY`](../data-transform/INCOMPLETE_TRANSFORM_INVENTORY.md) — the list itself could not be read completely.
- [`TRANSFORM_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_IDENTITY_MISMATCH.md) — the record read by ID or name belongs to a different transform.
