# `DATA_GRAPH_CHANGE_NOT_APPLIED`

> The graph read back after an accepted update has another join than the file (a newly added related object or a concurrent edit). Retrieve the graph; to change a join, delete the graph and create it again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data graph                    |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

The deploy sent the update and Salesforce answered it with success. After the graph was ready again, the plugin read it back: a related object has another join (`path`) than the file. Joins of existing related objects are refused before the write, so this concerns a newly added related object, or a graph someone changed at the same time.

Salesforce keeps the old join when an update changes it, and applies the other changes of the same update.

## Why the plugin reports it

The plugin refuses join changes before any write ([`DATA_GRAPH_JOIN_CHANGE`](../data-graph/DATA_GRAPH_JOIN_CHANGE.md)). This check after the write makes sure that a join Salesforce ignored is never reported as `updated`. The update was accepted, so the mutation is `unknown`: other changes of it may have been applied.

## How to fix

1. Retrieve the graph to see what the org holds now.
2. To change a join, delete the graph and deploy the file again to create it.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: data-graph:Customer360; mutation: unknown.
DATA_GRAPH_CHANGE_NOT_APPLIED: Salesforce accepted the update of the data graph Customer360 but the graph read back has another join than the file (for example on a newly added related object, or after a concurrent edit), so the change is not reported as updated. Other changes of the same PUT may have been applied: retrieve the graph to see its current state.
```

## Related codes

- [`DATA_GRAPH_JOIN_CHANGE`](../data-graph/DATA_GRAPH_JOIN_CHANGE.md) — a join change refused before any write.
