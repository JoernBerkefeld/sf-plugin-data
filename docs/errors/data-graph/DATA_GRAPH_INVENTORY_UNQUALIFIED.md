# `DATA_GRAPH_INVENTORY_UNQUALIFIED`

> Retrieving all data graphs at once is not supported. Name one graph with --metadata data-graph:<Name>.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Data graph                              |
| **Commands** | `sf data360 retrieve`                   |
| **Outcome**  | `blocked` — nothing was read or written |

## What it means

You selected the bare type `data-graph` without a name. The retrieve only supports one named data graph.

## Why the plugin stops

The plugin retrieves exactly what you name. It does not list and export every graph in the org.

## How to fix

Name the graph:

```text
sf data360 retrieve --metadata data-graph:CustomerGraph
```

## Example output

```text
Retrieve: blocked (DATA_GRAPH_INVENTORY_UNQUALIFIED).
DATA_GRAPH_INVENTORY_UNQUALIFIED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieving all data graphs at once is not supported. Name one graph with --metadata data-graph:<Name>.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/DATA_GRAPH_INVENTORY_UNQUALIFIED.md
```

## Related codes

- [`NATIVE_GRAPH_SELECTION_UNSUPPORTED`](../data-graph/NATIVE_GRAPH_SELECTION_UNSUPPORTED.md) — only one data graph per command.
- [`IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED`](../identity-resolution/IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED.md) — the same rule for identity resolution.
