# `RELATIONSHIP_INVENTORY_UNQUALIFIED`

> Retrieving every relationship of the org is not supported. Select a source DMO with -m relationship:Name__dlm to retrieve the relationships that start from it.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Relationship                            |
| **Commands** | `sf data360 retrieve`                   |
| **Outcome**  | `blocked` — nothing was read or written |

## What it means

The selection contains the bare type `relationship`, which would mean every relationship of the org.

## Why the plugin stops

Relationships are read through the list of one DMO. The plugin retrieves them per source DMO instead of reading every DMO's list.

## How to fix

1. Run `sf data360 retrieve -m relationship:<Dmo__dlm>` for each DMO the relationships start from.

## Example output

```text
Retrieve: blocked (RELATIONSHIP_INVENTORY_UNQUALIFIED).
RELATIONSHIP_INVENTORY_UNQUALIFIED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieving every relationship of the org is not supported. Select a source DMO with -m relationship:Name__dlm to retrieve the relationships that start from it.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_INVENTORY_UNQUALIFIED.md
```

## Related codes

- [`SEGMENT_INVENTORY_UNQUALIFIED`](../segment/SEGMENT_INVENTORY_UNQUALIFIED.md) — The same rule for segments.
