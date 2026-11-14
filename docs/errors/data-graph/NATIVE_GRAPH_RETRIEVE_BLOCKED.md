# `NATIVE_GRAPH_RETRIEVE_BLOCKED`

> The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder (use --overwrite to replace a changed file), then rerun.

|              |                                                                           |
| ------------ | ------------------------------------------------------------------------- |
| **Family**   | Data graph                                                                |
| **Commands** | `sf data360 retrieve`                                                     |
| **Outcome**  | `blocked` — no file was written, or a written file could not be confirmed |

## What it means

Retrieving data graphs has three steps: read the org context once, then for each selected graph read the graph and write `data360/dataGraphs/<Name>.native-dataGraph.json`. One of them failed: the graph does not exist under that name, the org answered with an error, the graph has a shape the plugin cannot check, a different file already exists and `--overwrite` was not given, or the written file could not be confirmed.

- When the org context failed, no graph was read; the diagnostic has no graph name.
- When one graph failed, the diagnostic names that graph (`identity`, `family: "data-graph"`) and the next selected graph is still retrieved. Other families in the same retrieve are not affected.

When Salesforce sent an error, its detail is part of the message. Otherwise the message starts with `Plugin verification or request completion failed; no Salesforce rejection was confirmed.`

## Why the plugin stops

The plugin writes a graph file only from a complete, checked answer, and it does not replace a different local file without your consent.

## How to fix

1. Read the message for a Salesforce detail.
2. Check the exact graph name in Data Cloud and your access to it.
3. If a local file with other content exists, rerun with `--overwrite` to replace it.

## Example output

The org context failed:

```text
Retrieve: blocked (NATIVE_GRAPH_RETRIEVE_BLOCKED).
NATIVE_GRAPH_RETRIEVE_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder (use --overwrite to replace a changed file), then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md
```

One of two selected graphs failed:

```text
Retrieve: blocked.
Downloaded data-graph:OrderGraph (retrieved).
data-graph:CustomerGraph: NATIVE_GRAPH_RETRIEVE_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder (use --overwrite to replace a changed file), then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md
Downloaded data-graph: 1
```

```json
{
  "code": "NATIVE_GRAPH_RETRIEVE_BLOCKED",
  "message": "Plugin verification or request completion failed; no Salesforce rejection was confirmed. Retrieval did not complete. Check selection, authenticated org, service capability and output path.",
  "retryable": false,
  "identity": { "dataSpace": "default", "apiName": "CustomerGraph" },
  "family": "data-graph",
  "hint": "The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder (use --overwrite to replace a changed file), then rerun.",
  "docs": "https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md"
}
```

## Related codes

- [`UNSUPPORTED_DATA_GRAPH_CONFIGURATION`](../data-graph/UNSUPPORTED_DATA_GRAPH_CONFIGURATION.md) — the graph has a shape the plugin cannot check.
- [`PARTIAL_DATA_GRAPH_OUTPUT`](../data-graph/PARTIAL_DATA_GRAPH_OUTPUT.md) — the file was written but not confirmed.
- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — a different local file already exists.
