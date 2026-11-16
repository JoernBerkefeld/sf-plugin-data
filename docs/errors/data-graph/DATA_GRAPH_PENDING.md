# `DATA_GRAPH_PENDING`

> A data graph of that name is still being built, or was just deleted and is still listed, so the deploy cannot write it now. Wait a few minutes, then rerun the same deploy.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data graph                      |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was written |

## What it means

The deploy read the graph named in the file and found it in between two states:

- **Just deleted:** the graph read answers that the graph does not exist, but the graph metadata, the graph list or the `DataGraph` records still hold it. Salesforce keeps a deleted graph listed for a few minutes. A create of the same name is not possible until it is gone.
- **Still being built:** the graph exists, but Salesforce has not generated all of its objects (data model objects, mapping and transform) yet. This happens for about half a minute after a create.

## Why the plugin stops

A create while the old graph is still listed, or an update of a graph that is still being built, cannot be confirmed. The deploy stops before any write.

## How to fix

1. Wait a few minutes.
2. Rerun the same deploy. Use `--preview` first to see whether it now plans a create or an update.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: data-graph:Customer360; mutation: not-attempted.
DATA_GRAPH_PENDING: A data graph named Customer360 was deleted but Salesforce still lists it, so a graph of that name cannot be created yet. Wait a few minutes and rerun the deploy. Nothing was written.
Deployed: 0 (0 created / 0 updated / 0 failed)
DEPLOY_EXECUTION_BLOCKED: Deployment did not complete and nothing was written to the org. Read the item diagnostics, fix the cause, then rerun.
```

## Related codes

- [`PROCESSING_ACKNOWLEDGEMENT_REQUIRED`](../general/PROCESSING_ACKNOWLEDGEMENT_REQUIRED.md) — a graph create or change without `--allow-processing`.
- [`DATA_GRAPH_CREATE_UNCONFIRMED`](../data-graph/DATA_GRAPH_CREATE_UNCONFIRMED.md) — a create that was sent but not confirmed in time.
