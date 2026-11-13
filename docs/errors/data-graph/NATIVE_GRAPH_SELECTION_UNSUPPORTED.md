# `NATIVE_GRAPH_SELECTION_UNSUPPORTED`

> A data graph must be the only item in the command, named exactly. Run one graph per command, without other files or --draft.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Data graph                                 |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was read or changed    |

## What it means

The selection contains a data graph together with something else: another graph, another type (also in a `--changed-since` range) or `--draft`. For retrieve, the selector must be exactly `data-graph:<Name>`.

## Why the plugin stops

Graph builds take a long time and have their own wait budget. The plugin keeps each graph operation separate so one result is never mixed up with another.

## How to fix

- Retrieve: `sf data360 retrieve --metadata data-graph:<Name>`, one graph per command.
- Deploy: select exactly one `data360/dataGraphs/<Name>.native-dataGraph.json` file (explicitly or as the only change in a `--changed-since` range), without other files or `--draft`. Deploy other components in a separate command.

## Example output

```text
Deploy preview: blocked (NATIVE_GRAPH_SELECTION_UNSUPPORTED). No deployment executed.
NATIVE_GRAPH_SELECTION_UNSUPPORTED: Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: A data graph must be the only item in the command, named exactly. Run one graph per command, without other files or --draft.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/NATIVE_GRAPH_SELECTION_UNSUPPORTED.md
```

## Related codes

- [`DATA_GRAPH_INVENTORY_UNQUALIFIED`](../data-graph/DATA_GRAPH_INVENTORY_UNQUALIFIED.md) — the bare type without a name.
