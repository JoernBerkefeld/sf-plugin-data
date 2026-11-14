# `UNSUPPORTED_DATA_GRAPH_CONFIGURATION`

> The data graph definition or the answer from the org has a shape the plugin cannot check. Retrieve the graph again to get a supported file, or simplify the definition, then rerun.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data graph                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

The plugin checks every data graph definition it reads or sends: the local file, the graph returned by the org and the answers to its requests. This code means one of them did not have the expected shape, for example an unknown or missing key, a wrong value type, or a name that does not match.

## Why the plugin stops

A graph the plugin cannot check could be changed or deleted in a way you did not intend. The plugin stops before acting on it.

## How to fix

1. Retrieve the graph again (`sf data360 retrieve --metadata data-graph:<Name> --overwrite`) and use that file as the base for your changes.
2. Avoid hand-written keys the retrieved file does not have.
3. Rerun the command.

## Example output

`sf data360 retrieve` reports this case under [`NATIVE_GRAPH_RETRIEVE_BLOCKED`](../data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md):

```text
Retrieve: blocked.
data-graph:CustomerGraph: NATIVE_GRAPH_RETRIEVE_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder (use --overwrite to replace a changed file), then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md
Downloaded data-graph: 0
```

## Related codes

- [`NATIVE_GRAPH_RETRIEVE_BLOCKED`](../data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md) — the retrieve result that carries this case.
- [`UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION`](../identity-resolution/UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION.md) — the same check for identity resolution.
