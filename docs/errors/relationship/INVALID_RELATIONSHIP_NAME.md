# `INVALID_RELATIONSHIP_NAME`

> The relationship name is not a valid API name: it must start with a letter and use only letters, digits and underscores. Use the exact name from the org.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Relationship                    |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A relationship is deleted by its exact name. The name given does not start with a letter, contains other characters than letters, digits and underscores, or is longer than 240 characters.

## Why the plugin stops

The name becomes part of the delete request URL. The plugin sends a delete only for a valid name.

## How to fix

1. Retrieve the source DMO's relationships with `sf data360 retrieve -m relationship:<SourceDmo__dlm>` to get the exact names.
2. Run `sf data360 delete -m relationship:<Name>` with one of them.

## Example output

```text
Delete: blocked.
Blocked: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: not-attempted.
INVALID_RELATIONSHIP_NAME: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The relationship name is not a valid API name: it must start with a letter and use only letters, digits and underscores. Use the exact name from the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/INVALID_RELATIONSHIP_NAME.md
```

## Related codes

- [`INVALID_RELATIONSHIP_BINDING`](../relationship/INVALID_RELATIONSHIP_BINDING.md) — A DMO name that is not valid.
