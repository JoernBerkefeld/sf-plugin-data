# `INCOMPLETE_TRANSFORM_INVENTORY`

> The list of data transforms in the org could not be read completely and consistently. Nothing was deleted; rerun the delete when the org is not changing transforms.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before deleting, the plugin reads the full list of data transforms in the org, 20 at a time, to confirm that the selected ID and name belong together. This code means a page was missing or malformed, the total count changed while paging, a row had an unexpected ID or name, a name or ID appeared twice, or the org holds more than 2,020 transforms.

## Why the plugin stops

The plugin only deletes a transform it can positively identify in a complete, stable list. A partial or shifting list cannot prove that the ID points to the transform named in your file, so deleting would be a guess.

## How to fix

1. Make sure nobody is creating or deleting data transforms in the org while the command runs.
2. Rerun the same `sf data360 delete` command.
3. If the org has more than 2,020 data transforms, delete the transform in Data Cloud instead.

## Example output

```text
Delete: blocked.
Blocked: data-transform:Orders_Copy; mutation: not-attempted.
INCOMPLETE_TRANSFORM_INVENTORY: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The list of data transforms in the org could not be read completely and consistently. Nothing was deleted; rerun the delete when the org is not changing transforms.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INCOMPLETE_TRANSFORM_INVENTORY.md
```

## Related codes

- [`TRANSFORM_DELETE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_DELETE_IDENTITY_MISMATCH.md) — the list was complete but did not contain the selected ID and name.
- [`TRANSFORM_DELETE_UNCONFIRMED`](../data-transform/TRANSFORM_DELETE_UNCONFIRMED.md) — reported instead when the list cannot be read after the DELETE was sent.
