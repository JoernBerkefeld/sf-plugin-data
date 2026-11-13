# `INVALID_TRANSFORM_DEPLOY_SELECTION`

> A transform deploy needs --transform-operation create, or update with a valid --transform-target-id. Do not pass a target ID with create. Fix the flags and rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Deploying a data transform requires you to say whether it is a new transform or an update of a known one. This code means `--transform-operation` is missing, `create` was combined with `--transform-target-id`, or `update` was given without a valid target ID (`1dt` followed by 15 characters).

## Why the plugin stops

The plugin never decides on its own whether to create or update. Guessing from a name lookup could create a duplicate or overwrite the wrong transform, so the choice and the exact ID for an update must come from you.

## How to fix

1. For a new transform, pass `--transform-operation create` and no target ID.
2. For an existing transform, pass `--transform-operation update --transform-target-id <1dt...>` with the record ID from the org.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (INVALID_TRANSFORM_DEPLOY_SELECTION). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_TRANSFORM_DEPLOY_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: A transform deploy needs --transform-operation create, or update with a valid --transform-target-id. Do not pass a target ID with create. Fix the flags and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_DEPLOY_SELECTION.md
```

## Related codes

- [`INVALID_TRANSFORM_FLAG_SCOPE`](../data-transform/INVALID_TRANSFORM_FLAG_SCOPE.md) — transform flags were given without a transform in the selection.
- [`INVALID_TRANSFORM_TARGET_ID`](../data-transform/INVALID_TRANSFORM_TARGET_ID.md) — the target ID has the wrong format.
