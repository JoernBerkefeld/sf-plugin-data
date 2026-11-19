# `INVALID_NATIVE_DATA_GRAPH_SCOPE`

> Data graphs work only with API version 68.0. Use --api-version auto or 68.0, then rerun.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data graph                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was sent to the org                         |

## What it means

The data graph requests were prepared for an API version other than 68.0. Graphs work in any data space of the org; the run's data space is `--dataspace` (`default` when omitted).

## Why the plugin stops

The plugin has verified data graph behaviour only on API 68 and does not send requests at another version.

## How to fix

1. Leave `--api-version` at `auto` or set it to `68.0`.
2. Rerun the command.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
INVALID_NATIVE_DATA_GRAPH_SCOPE: Data graph configuration could not be admitted.
Hint: Data graphs work only with API version 68.0. Use --api-version auto or 68.0, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/INVALID_NATIVE_DATA_GRAPH_SCOPE.md
```

## Related codes

- [`INVALID_SCOPE`](../general/INVALID_SCOPE.md) — the general check of the version.
- [`INVALID_NATIVE_DATA_GRAPH_NAME`](../data-graph/INVALID_NATIVE_DATA_GRAPH_NAME.md) — the graph name is not valid.
- [`DATA_GRAPH_DATASPACE_MISMATCH`](../data-graph/DATA_GRAPH_DATASPACE_MISMATCH.md) — the graph is in another data space than the run.
