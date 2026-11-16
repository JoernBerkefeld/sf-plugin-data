# `DATA_GRAPH_INVENTORY_UNQUALIFIED`

> Retrieving all data graphs at once is not supported. Name each graph with --metadata data-graph:<Name>; repeat it for several.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Data graph                              |
| **Commands** | `sf data360 retrieve`                   |
| **Outcome**  | `blocked` — nothing was read or written |

## What it means

You selected the bare type `data-graph` without a name. The retrieve reads only data graphs you name; repeat `--metadata data-graph:<Name>` for several.

## Why the plugin stops

The plugin retrieves exactly what you name. It does not list and export every graph in the org.

## How to fix

Name each graph:

```text
sf data360 retrieve --metadata data-graph:CustomerGraph --metadata data-graph:OrderGraph
```

## Example output

```text
Retrieve: blocked (DATA_GRAPH_INVENTORY_UNQUALIFIED).
DATA_GRAPH_INVENTORY_UNQUALIFIED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieving all data graphs at once is not supported. Name each graph with --metadata data-graph:<Name>; repeat it for several.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/DATA_GRAPH_INVENTORY_UNQUALIFIED.md
```

## Related codes

- [`RELATIONSHIP_INVENTORY_UNQUALIFIED`](../relationship/RELATIONSHIP_INVENTORY_UNQUALIFIED.md) — the same rule for relationships.
