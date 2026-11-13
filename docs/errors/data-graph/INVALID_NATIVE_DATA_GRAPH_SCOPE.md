# `INVALID_NATIVE_DATA_GRAPH_SCOPE`

> Data graphs work only with API version 68.0 in the default data space. Use --api-version auto or 68.0 and the default data space, then rerun.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data graph                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was sent to the org                         |

## What it means

The data graph requests were prepared for an API version other than 68.0 or a data space other than `default`.

## Why the plugin stops

The plugin has verified data graph behaviour only on API 68 in the default data space and does not send requests elsewhere.

## How to fix

1. Leave `--api-version` at `auto` or set it to `68.0`.
2. Use the default data space.
3. Rerun the command.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
INVALID_NATIVE_DATA_GRAPH_SCOPE: Data graph configuration could not be admitted.
Hint: Data graphs work only with API version 68.0 in the default data space. Use --api-version auto or 68.0 and the default data space, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/INVALID_NATIVE_DATA_GRAPH_SCOPE.md
```

## Related codes

- [`INVALID_SCOPE`](../general/INVALID_SCOPE.md) — the general check of version and data space.
- [`INVALID_NATIVE_DATA_GRAPH_NAME`](../data-graph/INVALID_NATIVE_DATA_GRAPH_NAME.md) — the graph name is not valid.
