# `INVALID_RELATIONSHIP_RESPONSE`

> Salesforce answered the relationship list in a shape the plugin does not expect. Rerun the command; if it repeats, inspect the raw list response for the DMO.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | Relationship                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`            |
| **Outcome**  | `failed` on retrieve, `blocked` on deploy and delete — nothing was changed |

## What it means

Relationships are read page by page from the source DMO's list. An answer was not valid JSON, was not an object, lacked the `relationships` list or a whole-number `totalSize`, or held an entry whose name, status, objects, fields, cardinality or owner were not text.

## Why the plugin stops

The plugin decides about creates and deletes from this list. It does not act on a list it cannot read reliably.

## How to fix

1. Rerun the command.
2. If it repeats, read the list directly: `sf api request rest "/services/data/v68.0/ssot/data-model-objects/<Dmo__dlm>/relationships?limit=200&offset=0" -o <alias>`.

## Example output

```text
Retrieve: failed.
relationship:Order__dlm: INVALID_RELATIONSHIP_RESPONSE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Relationship retrieval did not complete for this item; the org was not changed.
Hint: Salesforce answered the relationship list in a shape the plugin does not expect. Rerun the command; if it repeats, inspect the raw list response for the DMO.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/INVALID_RELATIONSHIP_RESPONSE.md
Downloaded relationship: 0
```

## Related codes

- [`RELATIONSHIP_INVENTORY_INCOMPLETE`](../relationship/RELATIONSHIP_INVENTORY_INCOMPLETE.md) — The list pages did not add up.
- [`RELATIONSHIP_HTTP_ERROR`](../relationship/RELATIONSHIP_HTTP_ERROR.md) — The list request failed.
