# `NATIVE_GRAPH_RETRIEVE_BLOCKED`

> The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder (use --overwrite to replace a changed file), then rerun.

|              |                                                                           |
| ------------ | ------------------------------------------------------------------------- |
| **Family**   | Data graph                                                                |
| **Commands** | `sf data360 retrieve`                                                     |
| **Outcome**  | `blocked` — no file was written, or a written file could not be confirmed |

## What it means

Retrieving a data graph has three steps: read the org context, read the graph, write `data360/dataGraphs/<Name>.native-dataGraph.json`. One of them failed: the graph does not exist under that name, the org answered with an error, the graph has a shape the plugin cannot check, a different file already exists and `--overwrite` was not given, or the written file could not be confirmed.

When Salesforce sent an error, its detail is part of the message.

## Why the plugin stops

The plugin writes a graph file only from a complete, checked answer, and it does not replace a different local file without your consent.

## How to fix

1. Read the message for a Salesforce detail.
2. Check the exact graph name in Data Cloud and your access to it.
3. If a local file with other content exists, rerun with `--overwrite` to replace it.

## Example output

```text
Retrieve: blocked (NATIVE_GRAPH_RETRIEVE_BLOCKED).
NATIVE_GRAPH_RETRIEVE_BLOCKED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder (use --overwrite to replace a changed file), then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md
```

## Related codes

- [`UNSUPPORTED_DATA_GRAPH_CONFIGURATION`](../data-graph/UNSUPPORTED_DATA_GRAPH_CONFIGURATION.md) — the graph has a shape the plugin cannot check.
- [`PARTIAL_DATA_GRAPH_OUTPUT`](../data-graph/PARTIAL_DATA_GRAPH_OUTPUT.md) — the file was written but not confirmed.
- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — a different local file already exists.
