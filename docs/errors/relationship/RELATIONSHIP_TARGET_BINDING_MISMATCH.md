# `RELATIONSHIP_TARGET_BINDING_MISMATCH`

> The relationship with this name links different objects or fields than the local file. Retrieve the source DMO's relationships to refresh the file, then check before deleting.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Relationship                    |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A relationship with the selected name exists in the source DMO's list, but its source or target object or field differs from the local file.

## Why the plugin stops

The file and the org disagree about what this relationship is. The plugin deletes only a relationship that matches the file.

## How to fix

1. Retrieve the source DMO's relationships with `sf data360 retrieve -m relationship:<SourceDmo__dlm> --overwrite`.
2. Check that the relationship is the one you want to delete, then run the delete again.

## Example output

```text
Delete: blocked.
Blocked: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: not-attempted.
RELATIONSHIP_TARGET_BINDING_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The relationship with this name links different objects or fields than the local file. Retrieve the source DMO's relationships to refresh the file, then check before deleting.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_TARGET_BINDING_MISMATCH.md
```

## Related codes

- [`RELATIONSHIP_NAME_MISMATCH`](../relationship/RELATIONSHIP_NAME_MISMATCH.md) — The binding exists under another name.
