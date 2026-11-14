# `RELATIONSHIP_FILE_IDENTITY_MISMATCH`

> The relationship definition the delete checks names a different relationship than the one selected. Nothing was deleted; with --changed-since, fix the deleted file's content, otherwise report it.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Relationship                    |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A relationship delete checks one definition: the relationship the org lists under the source DMO named in `-m relationship:<SourceDmo__dlm>:<Name>`, or with `--changed-since` the base content of the deleted `data360/relationship/<Name>.relationship-meta.json` file. The `identity.apiName` of that definition is a different name than the one the delete is about to send.

## Why the plugin stops

The definition tells the plugin which source DMO to check. A definition for another relationship could point to the wrong DMO.

## How to fix

1. With `--changed-since`, check that the deleted file's base content names the relationship of its file name.
2. With `-m`, report the command you ran: the plugin read this definition itself, so this points to a plugin bug.

## Example output

```text
Delete: blocked.
Blocked: relationship:Order__dlm:Order_CustomerId_map_Customer_Id_1794467679481; mutation: not-attempted.
RELATIONSHIP_FILE_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The relationship definition the delete checks names a different relationship than the one selected. Nothing was deleted; with --changed-since, fix the deleted file's content, otherwise report it.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_FILE_IDENTITY_MISMATCH.md
```

## Related codes

- [`RELATIONSHIP_NAME_MISMATCH`](../relationship/RELATIONSHIP_NAME_MISMATCH.md) — The binding exists under another name.
- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — The file is not a valid relationship file.
