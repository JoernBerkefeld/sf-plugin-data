# `NATIVE_GRAPH_SELECTION_UNSUPPORTED`

> Retrieve takes exactly one data graph per command. Name it with --metadata data-graph:<Name> and no other selector.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Data graph                              |
| **Commands** | `sf data360 retrieve`                   |
| **Outcome**  | `blocked` — nothing was read or changed |

## What it means

A retrieve selection names a data graph together with another selector, or the graph selector is not exactly `data-graph:<Name>`. Deploy is not affected: it takes any number of graphs beside other families and runs them last.

## Why the plugin stops

A graph retrieve reads one graph definition by name and writes one file. The plugin does not list or combine graphs in one retrieve.

## How to fix

- Retrieve one graph per command: `sf data360 retrieve --metadata data-graph:<Name>`.
- Retrieve other components in a separate command.

## Example output

```text
Retrieve: blocked (NATIVE_GRAPH_SELECTION_UNSUPPORTED).
NATIVE_GRAPH_SELECTION_UNSUPPORTED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieve takes exactly one data graph per command. Name it with --metadata data-graph:<Name> and no other selector.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/NATIVE_GRAPH_SELECTION_UNSUPPORTED.md
```

## Related codes

- [`DATA_GRAPH_INVENTORY_UNQUALIFIED`](../data-graph/DATA_GRAPH_INVENTORY_UNQUALIFIED.md) — the bare type without a name.
