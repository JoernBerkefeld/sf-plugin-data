# `TRANSFORM_PREREQUISITE_DRIFT`

> The source or output DLO changed between the plugin checks and the write. Nothing was changed; wait until nobody is editing those DLOs, then rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data transform                           |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The plugin reads the source and output DLOs during planning and again right before sending the create, update or delete. The second read showed a different definition, ID or data space membership.

## Why the plugin stops

The plan was only checked against the DLOs as they were first read. If they changed, those checks no longer hold, so the plugin does not send the write.

## How to fix

1. Find out who or what is changing the DLOs and let that finish.
2. Rerun the command.

## Example output

```text
Deploy execution: blocked (TRANSFORM_PREREQUISITE_DRIFT). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_PREREQUISITE_DRIFT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The source or output DLO changed between the plugin checks and the write. Nothing was changed; wait until nobody is editing those DLOs, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_PREREQUISITE_DRIFT.md
```

## Related codes

- [`TRANSFORM_PREREQUISITE_CHANGED`](../data-transform/TRANSFORM_PREREQUISITE_CHANGED.md) — the same check, failing after the write was sent.
- [`TRANSFORM_TARGET_DRIFT`](../data-transform/TRANSFORM_TARGET_DRIFT.md) — the transform itself changed during the run.
