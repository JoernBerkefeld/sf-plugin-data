# `RELATIONSHIP_FILE_IDENTITY_MISMATCH`

> The local relationship file names a different relationship than the one selected. Make identity.apiName in the file match the name in -m relationship:Name.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Relationship                    |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Delete reads `data360/relationship/<Name>.relationship-meta.json` for the selected name. The `identity.apiName` inside the file is a different name.

## Why the plugin stops

The file tells the plugin which source DMO to check. A file for another relationship could point to the wrong DMO.

## How to fix

1. Retrieve the source DMO's relationships with `--overwrite` to rewrite the file.
2. Or correct `identity.apiName` in the file, then run the delete again.

## Example output

```text
Delete: blocked.
Blocked: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: not-attempted.
RELATIONSHIP_FILE_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The local relationship file names a different relationship than the one selected. Make identity.apiName in the file match the name in -m relationship:Name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_FILE_IDENTITY_MISMATCH.md
```

## Related codes

- [`RELATIONSHIP_FILE_REQUIRED`](../relationship/RELATIONSHIP_FILE_REQUIRED.md) — The file is missing.
- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — The file is not a valid relationship file.
