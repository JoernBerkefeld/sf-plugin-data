# `DATA_GRAPH_ROOT_NOT_FOUND`

> The root DMO of the graph does not exist in the target org. Deploy that DMO, or the identity resolution ruleset that creates it, then preview the graph again.

|              |                                               |
| ------------ | --------------------------------------------- |
| **Family**   | Data graph                                    |
| **Commands** | `sf data360 deploy --preview`                 |
| **Outcome**  | `blocked` — preview only, nothing was changed |

## What it means

The preview read the root object named in `primaryObjectName` of the graph file and the target answered that it does not exist in the default data space.

## Why the plugin stops

A graph is built on its root object. The preview reports a missing root before you deploy. Only `--preview` makes this check; a real deploy sends the graph and Salesforce decides.

## How to fix

1. Check the root DMO name in the graph file.
2. Deploy the DMO first, or, for a unified DMO, the identity resolution ruleset that creates it.
3. Preview the graph again.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_FAILED). No deployment executed.
Planned blocked: data-graph:CustomerGraph.
DATA_GRAPH_ROOT_NOT_FOUND: The graph root Customer__dlm does not exist in the target (data space default).
Hint: The root DMO of the graph does not exist in the target org. Deploy that DMO, or the identity resolution ruleset that creates it, then preview the graph again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/DATA_GRAPH_ROOT_NOT_FOUND.md
```

## Related codes

- [`DATA_GRAPH_OWNER_NOT_FOUND`](../data-graph/DATA_GRAPH_OWNER_NOT_FOUND.md) — the root is a unified DMO without a ruleset.
