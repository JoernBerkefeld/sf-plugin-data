# `CROSS_DATASPACE_UNSUPPORTED`

> --allow-cross-dataspace cannot translate this kind of file yet (graphs, identity resolution, transforms, insights, SQL segments, streams). Nothing was sent. Deploy those in their own data space.

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Family**   | General                                                  |
| **Commands** | `sf data360 deploy --allow-cross-dataspace`              |
| **Outcome**  | `blocked` — nothing was sent to the org, no file written |

## What it means

This only matters when your org has more than one data space.

`--allow-cross-dataspace` (`-c`) translates these kinds of files from another data space:

- DMOs, mappings and relationships.
- DLOs: the run's data space is added to the DLO's data spaces.
- UI and Waterfall segments.

Other kinds are not translated yet:

- Data graphs, identity resolution rulesets and data transforms.
- Calculated insights, SQL (DBT) segments and segments of other types.
- Data streams.

## Why the plugin stops

A half-translated selection would deploy some components into the run's data space and leave the rest pointing at the old one. So the whole deploy is refused before the first write.

## How to fix

1. Leave those files out of the cross-data-space deploy, for example with a narrower `--source-dir` or `-m`.
2. Deploy them in their own data space (`--dataspace` set to the one their `c__dataSpace` names), or create them in the target data space by hand.

## Example output

```text
Deploy preview: blocked (CROSS_DATASPACE_UNSUPPORTED). No deployment executed.
Data space: dataspace2.
CROSS_DATASPACE_UNSUPPORTED: --allow-cross-dataspace cannot deploy these files into dataspace2 yet: data360/dataGraphs/Graph.native-dataGraph.json (data graphs cannot be translated into another data space yet). Nothing was sent. Deploy them with --dataspace default, or leave them out of this deploy.
Hint: --allow-cross-dataspace cannot translate this kind of file yet (graphs, identity resolution, transforms, insights, SQL segments, streams). Nothing was sent. Deploy those in their own data space.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/CROSS_DATASPACE_UNSUPPORTED.md
```

## Related codes

- [`CROSS_DATASPACE_UNRESOLVED`](../general/CROSS_DATASPACE_UNRESOLVED.md) — a supported file holds a name that cannot be placed.
- [`DATA_GRAPH_DATASPACE_MISMATCH`](../data-graph/DATA_GRAPH_DATASPACE_MISMATCH.md) — a graph file names another data space than the run.
