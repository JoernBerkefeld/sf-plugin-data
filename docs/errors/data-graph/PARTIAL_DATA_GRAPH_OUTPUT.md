# `PARTIAL_DATA_GRAPH_OUTPUT`

> The graph file was written, but the final check of it failed, so it may not match the org. Inspect the .native-dataGraph.json file and retrieve again with --overwrite.

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| **Family**   | Data graph                                                |
| **Commands** | `sf data360 retrieve`                                     |
| **Outcome**  | `blocked` — a file was written but could not be confirmed |

## What it means

The retrieve wrote `data360/dataGraphs/<Name>.native-dataGraph.json` and then read it back. The file on disk was not the expected content (for example another process changed it), or it could not be read back as a valid graph. The retrieve reports this under `NATIVE_GRAPH_RETRIEVE_BLOCKED`.

## Why the plugin stops

The plugin cannot vouch for a file it could not confirm, and it does not delete files it has already placed. It reports the state so you can check it.

## How to fix

1. Open the file and check it, or delete it.
2. Make sure no other tool writes to the output folder at the same time.
3. Rerun `sf data360 retrieve --metadata data-graph:<Name> --overwrite`.

## Example output

```text
Retrieve: blocked (NATIVE_GRAPH_RETRIEVE_BLOCKED).
PARTIAL_DATA_GRAPH_OUTPUT: Data graph configuration could not be admitted.
Hint: The graph file was written, but the final check of it failed, so it may not match the org. Inspect the .native-dataGraph.json file and retrieve again with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/PARTIAL_DATA_GRAPH_OUTPUT.md
```

## Related codes

- [`NATIVE_GRAPH_RETRIEVE_BLOCKED`](../data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md) — the retrieve result that carries this case.
- [`PARTIAL_IDENTITY_RESOLUTION_OUTPUT`](../identity-resolution/PARTIAL_IDENTITY_RESOLUTION_OUTPUT.md) — the same situation for an identity resolution file.
