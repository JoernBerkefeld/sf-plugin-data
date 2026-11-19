# `DATA_GRAPH_DATASPACE_MISMATCH`

> The data graph file's c__dataSpace, or the graph of that name in the org, is in another data space than the run. Graph names are unique in the org; rerun with the --dataspace the message names, or correct c__dataSpace.

|              |                                                                         |
| ------------ | ----------------------------------------------------------------------- |
| **Family**   | Data graph                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`         |
| **Outcome**  | `blocked` before any write (deploy, delete); a failed item (retrieve)   |

## What it means

Every command runs in one data space: `--dataspace`, or `default` when it is left out. A data graph file names its data space in `c__dataSpace`, and the graph in the org names it in `dataspaceName`. This code means the file, or the graph of that name in the org, is in another data space than the run.

Graph names are unique in the org: Salesforce takes a second create of the same name in another data space as an update of the first graph and refuses it. A read by name therefore finds the graph wherever it is, and the plugin checks its data space before it projects, keeps or changes anything.

## Why the plugin stops

A write or delete in the wrong data space would change a graph the run does not cover, and a retrieved file would carry the wrong data space. The plugin refuses before any write, delete or file is written, and never keeps such a graph as a verbatim file.

## How to fix

1. Run the command with the `--dataspace` the message names.
2. Or correct `c__dataSpace` (and `definition.dataspaceName`, when the file has it) in the file.

## Example output

```text
Deploy preview: blocked. Nothing was sent to the org.
Data space: dataspace2.
DATA_GRAPH_DATASPACE_MISMATCH: The file of data graph ExampleGraph names the data space "default" in c__dataSpace, but the run's data space is "dataspace2" (--dataspace, default "default"). Graph names are unique in the org, so run the command with --dataspace "default", or correct the file. Nothing was written.
```

## Related codes

- [`DATA_GRAPH_DATASPACE_UNREADABLE`](../data-graph/DATA_GRAPH_DATASPACE_UNREADABLE.md) — the graph read names no usable data space.
- [`DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE`](../data-graph/DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE.md) — the graph's root DMO is in another data space.
- [`UNKNOWN_DATASPACE`](../general/UNKNOWN_DATASPACE.md) — the org has no data space of that name.
