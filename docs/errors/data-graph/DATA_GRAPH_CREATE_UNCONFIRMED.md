# `DATA_GRAPH_CREATE_UNCONFIRMED`

> The graph create request was sent, but the graph could not be confirmed in time. It may exist: retrieve it or rerun the same deploy before changing anything.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data graph                                                      |
| **Commands** | `sf data360 deploy`                                             |
| **Outcome**  | `failed` — the graph may have been created (mutation `unknown`) |

## What it means

The plugin sent the create request for the data graph and then waited for it to become ready. Building a graph can take many minutes. Either `--wait-timeout` (default 1800 seconds) ran out first, or one of the checks after the request (the answer, the settlement, the identity of the new graph) could not confirm it.

The message names the step that could not confirm the graph.

## Why the plugin stops

The graph may exist and still be building. Sending the create again could fail or create confusion, and the plugin does not roll back what it cannot see.

## How to fix

1. Wait, then retrieve the graph (`sf data360 retrieve --metadata data-graph:<Name>`) or rerun the same deploy.
2. A rerun reports `unchanged` once the graph is ready as written.
3. For large graphs, give later deploys more time with `--wait-timeout <seconds>`.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: data-graph:CustomerGraph; mutation: unknown.
DATA_GRAPH_CREATE_UNCONFIRMED: The create request was sent but --wait-timeout ran out before the graph was confirmed; it may exist. Retrieve it or deploy again to reconcile.
Hint: The graph create request was sent, but the graph could not be confirmed in time. It may exist: retrieve it or rerun the same deploy before changing anything.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/DATA_GRAPH_CREATE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
```

## Related codes

- [`NATIVE_GRAPH_RETRIEVE_BLOCKED`](../data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md) — shown if the follow-up retrieve fails.
