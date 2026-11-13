# `SQL_DEPENDENCIES_UNQUALIFIED`

> The segment SQL is not in the one shape the plugin supports, so its DMO dependency cannot be read. Use a single-DMO query with WHERE 1=0, or manage this segment in Data Cloud.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Segment                                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

For a segment, the plugin works out which data model object (DMO) and field the SQL depends on. It only understands one shape: `SELECT Dmo__dlm.Field__c FROM Dmo__dlm WHERE 1 = 0`, optionally followed by `AND Dmo__dlm.Field__c IS NOT NULL` with the same DMO and field. Any other SQL (joins, aliases, other conditions, other objects) cannot be read safely.

## Why the plugin stops

The plugin does not guess dependencies from SQL it cannot parse. A wrong guess could deploy or delete a segment without checking the DMO it really uses.

## How to fix

1. Check the segment SQL in Data Cloud.
2. If you want to manage it with the plugin, reduce it to the supported single-DMO shape.
3. Otherwise manage this segment in Data Cloud directly.

## Example output

```text
Retrieve: failed.
segment:Empty_Audience: SQL_DEPENDENCIES_UNQUALIFIED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: The segment SQL is not in the one shape the plugin supports, so its DMO dependency cannot be read. Use a single-DMO query with WHERE 1=0, or manage this segment in Data Cloud.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SQL_DEPENDENCIES_UNQUALIFIED.md
```

## Related codes

- [`UNSUPPORTED_SEGMENT_VARIANT`](../segment/UNSUPPORTED_SEGMENT_VARIANT.md) — other parts of the segment are outside the supported shape.
- [`INVALID_SEGMENT_DEPENDENCIES`](../segment/INVALID_SEGMENT_DEPENDENCIES.md) — the dependency list does not match what the SQL uses.
