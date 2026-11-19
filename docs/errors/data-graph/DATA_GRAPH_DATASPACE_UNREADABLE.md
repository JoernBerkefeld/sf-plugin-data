# `DATA_GRAPH_DATASPACE_UNREADABLE`

> The org answered the read of the data graph without a usable data space (dataspaceName), so the plugin cannot tell where the graph is and wrote or changed nothing. Rerun; if it repeats, check the graph in Data Cloud.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data graph                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` or a failed item; nothing was written or changed      |

## What it means

The plugin reads a data graph by name and takes its data space from the answer (`dataspaceName`) before anything else. This code means the answer named no usable data space.

## Why the plugin stops

Without the graph's data space the plugin cannot tell whether the graph belongs to the run's data space, so it does not write a file, update or delete it.

## How to fix

1. Rerun the command; a passing service problem clears.
2. If it repeats, check the graph in Data Cloud.

## Example output

```text
Retrieve: failed.
DATA_GRAPH_DATASPACE_UNREADABLE: data-graph:ExampleGraph was not retrieved.
```

## Related codes

- [`DATA_GRAPH_DATASPACE_MISMATCH`](../data-graph/DATA_GRAPH_DATASPACE_MISMATCH.md) — the graph is in another data space than the run.
