# `RELATIONSHIP_NAME_MISMATCH`

> No relationship has this name, but another one carries the file's binding. Retrieve the source DMO's relationships and delete that one by its name.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Relationship                    |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

No relationship of the source DMO has the selected name, but one with a different name links the same objects and fields as the local file. This happens when the file was deployed again and Salesforce generated a new name. The message names that relationship.

## Why the plugin stops

The plugin deletes only the relationship you named. It does not switch to another one, even if the binding matches.

## How to fix

1. Retrieve the source DMO's relationships: `sf data360 retrieve -m relationship:<SourceDmo__dlm>`.
2. Delete the relationship named in the message: `sf data360 delete -m relationship:<OtherName>`.

## Example output

```text
Delete: blocked.
Blocked: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: not-attempted.
RELATIONSHIP_NAME_MISMATCH: No relationship is named Order_CustomerId_map_Customer_Id_1794467679481, but the org relationship Order_CustomerId_map_Customer_Id_1794467680012 carries the file's binding. It was not deleted. Retrieve it (sf data360 retrieve -m relationship:Order__dlm) and delete it by that name (sf data360 delete -m relationship:Order_CustomerId_map_Customer_Id_1794467680012). Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: No relationship has this name, but another one carries the file's binding. Retrieve the source DMO's relationships and delete that one by its name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_NAME_MISMATCH.md
```

## Related codes

- [`RELATIONSHIP_TARGET_BINDING_MISMATCH`](../relationship/RELATIONSHIP_TARGET_BINDING_MISMATCH.md) — The name exists but with another binding.
