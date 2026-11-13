# `SEGMENT_INVENTORY_UNQUALIFIED`

> Retrieving every segment at once is not supported. Select each segment by name with -m segment:Name.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Segment                                 |
| **Commands** | `sf data360 retrieve`                   |
| **Outcome**  | `blocked` — nothing was read or written |

## What it means

The selection contains the bare type `segment`, which would mean every segment of the org.

## Why the plugin stops

Each segment is checked against a narrow supported shape and its DMO. The plugin does not offer a listing of all segments, so it retrieves only segments you name.

## How to fix

1. Find the segment API names in the org.
2. Run `sf data360 retrieve -m segment:<Name>`, repeating `-m` for each segment.

## Example output

```text
Retrieve: blocked (SEGMENT_INVENTORY_UNQUALIFIED).
SEGMENT_INVENTORY_UNQUALIFIED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieving every segment at once is not supported. Select each segment by name with -m segment:Name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_INVENTORY_UNQUALIFIED.md
```

## Related codes

- [`RELATIONSHIP_INVENTORY_UNQUALIFIED`](../relationship/RELATIONSHIP_INVENTORY_UNQUALIFIED.md) — The same rule for relationships.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — A segment name that is not valid.
