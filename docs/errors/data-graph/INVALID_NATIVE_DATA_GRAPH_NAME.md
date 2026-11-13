# `INVALID_NATIVE_DATA_GRAPH_NAME`

> The data graph name is not a valid API name. Use a name that starts with a letter and has only letters, digits and underscores, at most 200 characters.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data graph                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was sent to the org                         |

## What it means

Every request for a data graph carries its name in the address. The name given to the plugin is not a plain API name.

## Why the plugin stops

Only a plain API name is put into the request address. Anything else could address a different resource.

## How to fix

1. Check the name in `--metadata data-graph:<Name>` and in `definition.name` of the graph file.
2. Use the exact API name of the graph, then rerun.

## Example output

```text
Retrieve: blocked (NATIVE_GRAPH_RETRIEVE_BLOCKED).
INVALID_NATIVE_DATA_GRAPH_NAME: Data graph configuration could not be admitted.
Hint: The data graph name is not a valid API name. Use a name that starts with a letter and has only letters, digits and underscores, at most 200 characters.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/INVALID_NATIVE_DATA_GRAPH_NAME.md
```

## Related codes

- [`INVALID_NATIVE_DATA_GRAPH_SCOPE`](../data-graph/INVALID_NATIVE_DATA_GRAPH_SCOPE.md) — the API version or data space is not supported.
