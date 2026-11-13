# `INVALID_WAIT_TIMEOUT_SCOPE`

> --wait-timeout applies only to a deploy of exactly one data graph, given in whole seconds. Remove it, or select a single data graph without --changed-since.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | General                          |
| **Commands** | `sf data360 deploy`              |
| **Outcome**  | `blocked` — nothing was deployed |

## What it means

`--wait-timeout` sets how many seconds a data graph deploy waits for the graph to become ready. It was refused because the selection is not exactly one data graph, because `--changed-since` was used, or because the value is not a positive whole number.

## Why the plugin stops

Only the data graph route waits for readiness in this way. Accepting the flag elsewhere would suggest a waiting behaviour that other families do not have.

## How to fix

- Remove `--wait-timeout`, or
- deploy one data graph on its own, for example `sf data360 deploy -m data-graph:<Name> --wait-timeout 1800`.

## Example output

```text
Deploy execution: blocked (INVALID_WAIT_TIMEOUT_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_WAIT_TIMEOUT_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: --wait-timeout applies only to a deploy of exactly one data graph, given in whole seconds. Remove it, or select a single data graph without --changed-since.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_WAIT_TIMEOUT_SCOPE.md
```

## Related codes

- [`NATIVE_GRAPH_SELECTION_UNSUPPORTED`](../data-graph/NATIVE_GRAPH_SELECTION_UNSUPPORTED.md) — a data graph must be deployed on its own.
- [`INVALID_ASYNC_SCOPE`](../general/INVALID_ASYNC_SCOPE.md) — `--async` used without an identity resolution.
