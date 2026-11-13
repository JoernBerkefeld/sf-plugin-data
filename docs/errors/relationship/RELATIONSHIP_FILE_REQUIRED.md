# `RELATIONSHIP_FILE_REQUIRED`

> Deleting a relationship needs its local file, which names the source DMO. Retrieve it with sf data360 retrieve -m relationship:SourceDmo__dlm, then run the delete again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Relationship                    |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Salesforce offers no read of a single relationship by name, so delete learns the source DMO from `data360/relationship/<Name>.relationship-meta.json` in the current directory. That file does not exist. The message names the expected path.

## Why the plugin stops

Without the source DMO, the plugin cannot confirm before the delete that the relationship exists, nor confirm afterwards that it is gone.

## How to fix

1. Change to the project folder that holds `data360/relationship/`.
2. If the file is missing, run `sf data360 retrieve -m relationship:<SourceDmo__dlm>` for the DMO the relationship starts from.
3. Run the delete again.

## Example output

```text
Delete: blocked.
Blocked: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: not-attempted.
RELATIONSHIP_FILE_REQUIRED: Deleting relationship:Order_CustomerId_map_Customer_Id_1794467679481 needs the local file /work/project/data360/relationship/Order_CustomerId_map_Customer_Id_1794467679481.relationship-meta.json, which names the source DMO; retrieve it with sf data360 retrieve --metadata relationship:<SourceDmo__dlm>. Nothing was deleted. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: Deleting a relationship needs its local file, which names the source DMO. Retrieve it with sf data360 retrieve -m relationship:SourceDmo__dlm, then run the delete again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_FILE_REQUIRED.md
```

## Related codes

- [`RELATIONSHIP_FILE_IDENTITY_MISMATCH`](../relationship/RELATIONSHIP_FILE_IDENTITY_MISMATCH.md) — The file exists but names another relationship.
