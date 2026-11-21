# `DATA_GRAPH_PREFIX_MISMATCH`

> A data graph name does not match its data space's prefix (ds2_ in dataspace2; no other space's prefix in default). A new graph is refused, an existing one only warned about.

|              |                                                                                  |
| ------------ | -------------------------------------------------------------------------------- |
| **Family**   | Data graph                                                                       |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve`                                       |
| **Outcome**  | deploy of a new data graph: `blocked` — nothing was changed; otherwise a warning |

## What it means

This only matters when your org has more than one data space.

Names of data graphs are unique in the whole org, whatever their data space. So each name carries the prefix of its data space, as Salesforce does itself for segments and identity resolution rulesets:

- In a data space other than `default`, the name starts with that space's prefix and an underscore, for example `ds2_OrderGraph` in `dataspace2` (prefix `ds2`).
- In `default`, the name does not start with the prefix of another data space.

The prefixes come from the org's list of data spaces, which the command reads once anyway. Every data graph is checked. The objects Salesforce generates for a graph are not.

## Why the plugin stops

- **Deploy of a new data graph:** refused before the first write of the whole deploy, so the org never gets a name that can clash with another data space.
- **Deploy of an existing data graph:** a warning; the deploy goes ahead. The plugin never renames anything in the org.
- **Retrieve:** a warning for every retrieved data graph whose name breaks the rule.

## How to fix

1. Rename the data graph in the file (`definition.name`) and the file itself, for example `data360/dataGraphs/ds2_OrderGraph.native-dataGraph.json`.
2. Rename every reference to it in your other files.
3. Rerun the deploy.

An existing data graph keeps its name; to follow the rule, create it again under the new name.

## Example output

```text
Deploy execution: blocked (DATA_GRAPH_PREFIX_MISMATCH). No automatic retry or rollback performed.
Data space: dataspace2.
Deployed: 0 (0 created / 0 updated / 0 failed)
DATA_GRAPH_PREFIX_MISMATCH: Data graph OrderGraph is new in the data space dataspace2, but its name does not start with ds2_, the prefix of that data space. Name it ds2_OrderGraph in the file and its file name, then rerun. Deployment was refused before any write; nothing was sent to the org. Fix the reported cause, then rerun.
Hint: A data graph name does not match its data space's prefix (ds2_ in dataspace2; no other space's prefix in default). A new graph is refused, an existing one only warned about.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/DATA_GRAPH_PREFIX_MISMATCH.md
```

## Related codes

- [`DATA_GRAPH_DATASPACE_MISMATCH`](../data-graph/DATA_GRAPH_DATASPACE_MISMATCH.md) — the graph file names another data space than the run.
- [`TRANSFORM_PREFIX_MISMATCH`](../data-transform/TRANSFORM_PREFIX_MISMATCH.md) — the same rule for data transforms.
