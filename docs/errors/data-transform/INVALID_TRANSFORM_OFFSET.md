# `INVALID_TRANSFORM_OFFSET`

> The plugin asked for an invalid page of the data transform list. Nothing was changed; this points to a plugin bug, so report it with the command you ran.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The data transform list is read in fixed pages of 20 rows, up to offset 2,000. This code means the plugin itself built a page request outside those bounds. It is an internal safety check and does not depend on your input or the org.

## Why the plugin stops

The plugin refuses to send a list request it did not intend, because an unexpected offset could skip rows and make the transform inventory look complete when it is not.

## How to fix

1. Rerun the command once to rule out a one-off problem.
2. If it happens again, open an issue for sf-plugin-data with the full command and the `--json` output.

## Example output

```text
Delete: blocked.
Blocked: data-transform:Orders_Copy; mutation: not-attempted.
INVALID_TRANSFORM_OFFSET: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The plugin asked for an invalid page of the data transform list. Nothing was changed; this points to a plugin bug, so report it with the command you ran.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_OFFSET.md
```

## Related codes

- [`INCOMPLETE_TRANSFORM_INVENTORY`](../data-transform/INCOMPLETE_TRANSFORM_INVENTORY.md) — the list could be requested but not read completely.
