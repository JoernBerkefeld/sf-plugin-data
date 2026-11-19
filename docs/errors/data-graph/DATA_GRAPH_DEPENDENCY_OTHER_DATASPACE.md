# `DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE`

> The root DMO of the graph is in another data space than the graph. Name the DMO of the graph's own data space (a standard DMO copy outside default is <prefix>_<Name>), then rerun.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Data graph                              |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed         |

## What it means

A data graph and its root DMO (`primaryObjectName`) are in one data space. Before any write the plugin reads the root with `?dataspace=` of the run's data space; this code means the read names another data space.

In a non-default data space a standard DMO is a copy with the prefix of the data space (`ds2_Individual__dlm`); a custom DMO created there keeps its plain name. Related objects are sent as written and Salesforce decides.

## Why the plugin stops

A graph on a DMO of another data space would differ from the file, or fail in a way the plugin could not report clearly. The command stops before any write.

## How to fix

1. Name the root DMO as it is stored in the graph's data space, for example `ds2_Individual__dlm` in `dataspace2`.
2. Map the DMO in that data space first when it does not exist there yet.

## Example output

```text
Deploy preview: blocked. Nothing was sent to the org.
Data space: dataspace2.
DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE: The graph root ssot__Individual__dlm is in the data space default, not in the graph's data space dataspace2. Name the DMO of the graph's data space (a standard DMO copy outside default is <prefix>_<Name>); nothing was written.
```

## Related codes

- [`DATA_GRAPH_ROOT_NOT_FOUND`](../data-graph/DATA_GRAPH_ROOT_NOT_FOUND.md) — the root DMO does not exist in the target.
- [`DATA_GRAPH_DATASPACE_MISMATCH`](../data-graph/DATA_GRAPH_DATASPACE_MISMATCH.md) — the graph itself is in another data space than the run.
