# `INVALID_WAIT_SCOPE`

> --wait applies only to a deploy that holds a data graph or to a segment publish, and must be whole minutes (1 or more). Remove it, or select a data graph or a segment.

|              |                                           |
| ------------ | ----------------------------------------- |
| **Family**   | General                                   |
| **Commands** | `sf data360 deploy`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was deployed          |

## What it means

`--wait` (`-w`) sets how many minutes each data graph of a deploy waits to become ready, and how many minutes a segment publish waits for its result. It was refused because the deploy selection (explicit or `--changed-since`) holds no data graph, because the publish selects a calculated insight, or because the value is not a positive whole number.

## Why the plugin stops

Only data graph deploys and segment publishes wait in this way. Accepting the flag without a graph would suggest a waiting behaviour that other families do not have.

## How to fix

- Remove `--wait`, or
- include the data graph in the selection, for example `sf data360 deploy -m data-graph:<Name> --wait 30`, or
- use it with a segment publish, for example `sf data360 publish -m segment:<Name> --wait 60`.

## Example output

```text
Deploy execution: blocked (INVALID_WAIT_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_WAIT_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: --wait applies only to a deploy that holds a data graph or to a segment publish, and must be whole minutes (1 or more). Remove it, or select a data graph or a segment.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_WAIT_SCOPE.md
```

## Related codes

- [`INVALID_ASYNC_SCOPE`](../general/INVALID_ASYNC_SCOPE.md) — `--async` used without an identity resolution.
