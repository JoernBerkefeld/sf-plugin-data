# `INVALID_WAIT_TIMEOUT_SCOPE`

> --wait-timeout applies only to a deploy that holds a data graph or to a segment publish, and must be whole seconds. Remove it, or select a data graph or a segment.

|              |                                           |
| ------------ | ----------------------------------------- |
| **Family**   | General                                   |
| **Commands** | `sf data360 deploy`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was deployed          |

## What it means

`--wait-timeout` sets how many seconds each data graph of a deploy waits to become ready, and how many seconds a segment publish waits for its result. It was refused because the deploy selection (explicit or `--changed-since`) holds no data graph, because the publish selects a calculated insight, or because the value is not a positive whole number.

## Why the plugin stops

Only data graph deploys and segment publishes wait in this way. Accepting the flag without a graph would suggest a waiting behaviour that other families do not have.

## How to fix

- Remove `--wait-timeout`, or
- include the data graph in the selection, for example `sf data360 deploy -m data-graph:<Name> --wait-timeout 1800`, or
- use it with a segment publish, for example `sf data360 publish -m segment:<Name> --wait-timeout 3600`.

## Example output

```text
Deploy execution: blocked (INVALID_WAIT_TIMEOUT_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_WAIT_TIMEOUT_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: --wait-timeout applies only to a deploy that holds a data graph or to a segment publish, and must be whole seconds. Remove it, or select a data graph or a segment.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_WAIT_TIMEOUT_SCOPE.md
```

## Related codes

- [`INVALID_ASYNC_SCOPE`](../general/INVALID_ASYNC_SCOPE.md) — `--async` used without an identity resolution.
