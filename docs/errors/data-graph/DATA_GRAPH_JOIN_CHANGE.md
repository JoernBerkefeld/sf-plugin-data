# `DATA_GRAPH_JOIN_CHANGE`

> The file changes the join of a related object the graph already has. Salesforce accepts such a change but keeps the old join, so the plugin does not send it. Keep the join of the org, or delete the graph and create it again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data graph                      |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was written |

## What it means

A related object of the file is already part of the graph in the org, but its `path` (the join to its parent, `fieldName` and `parentFieldName`) differs from the org.

At API 68, Salesforce answers such an update with HTTP 200 and rebuilds the graph, but the graph keeps its old join. Other changes of the same update are applied.

## Why the plugin stops

Sending the change would report an update that did not happen. The deploy stops before any write, also in preview: the preview item is `blocked` with target `present`, and the run reports `DEPLOY_PREVIEW_BLOCKED` (the deploy `DEPLOY_EXECUTION_BLOCKED`).

## How to fix

1. Keep the join the graph has in the org (retrieve the graph to get it), or
2. Delete the graph with `sf data360 delete -m data-graph:<Name>` and deploy the file again to create it with the new join.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: data-graph:Customer360; mutation: not-attempted.
DATA_GRAPH_JOIN_CHANGE: The join of the related object $.Order__dlm differs from the graph in the org. Salesforce accepts a join change but keeps the old join, so the plugin does not send it. Keep the join of the org in the file, or delete the graph and create it again with the new join. Nothing was written.
Deployed: 0 (0 created / 0 updated / 0 failed)
DEPLOY_EXECUTION_BLOCKED: Deployment did not complete and nothing was written to the org. Read the item diagnostics, fix the cause, then rerun.
```

## Related codes

- [`DATA_GRAPH_CHANGE_NOT_APPLIED`](../data-graph/DATA_GRAPH_CHANGE_NOT_APPLIED.md) — an accepted update whose graph still has another join afterwards.
