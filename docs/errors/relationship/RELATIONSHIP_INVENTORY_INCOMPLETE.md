# `RELATIONSHIP_INVENTORY_INCOMPLETE`

> The relationship list of the DMO did not add up (page count, total or duplicate names), possibly because it changed during the read. Rerun the command.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | Relationship                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`            |
| **Outcome**  | `failed` on retrieve, `blocked` on deploy and delete — nothing was changed |

## What it means

The plugin reads a DMO's relationships in pages of 200 and requires that the pages together hold exactly the reported `totalSize`, with unique names. The total changed between pages, fewer or more entries came back, or a name appeared twice.

## Why the plugin stops

Create and delete decisions depend on a complete list. A partial list could hide a relationship that already exists.

## How to fix

1. Make sure nobody creates or deletes relationships of this DMO at the same time.
2. Rerun the command.

## Example output

```text
Retrieve: failed.
relationship:Order__dlm: RELATIONSHIP_INVENTORY_INCOMPLETE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Relationship retrieval did not complete for this item; the org was not changed.
Hint: The relationship list of the DMO did not add up (page count, total or duplicate names), possibly because it changed during the read. Rerun the command.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_INVENTORY_INCOMPLETE.md
Downloaded relationship: 0
```

## Related codes

- [`INVALID_RELATIONSHIP_RESPONSE`](../relationship/INVALID_RELATIONSHIP_RESPONSE.md) — A page itself was malformed.
