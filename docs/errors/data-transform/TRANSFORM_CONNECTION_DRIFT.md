# `TRANSFORM_CONNECTION_DRIFT`

> The connection to the org changed while the command was running. Check that your org login is stable, then rerun the command.

|              |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Family**   | Data transform                                                                                |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                               |
| **Outcome**  | `blocked` or `failed`; for deploy and delete, the item outcome shows whether a write was sent |

## What it means

The plugin remembers the org instance URL and request handler when it starts and checks them before every call. This code means one of them changed mid-run, for example because the org login was replaced or re-authenticated against a different instance.

## Why the plugin stops

Every check the plugin made so far belongs to the original org connection. Sending the next request through a different connection could read or write a different org than the one that was checked.

## How to fix

1. Do not log in, log out or switch the alias for this org while the command runs.
2. Confirm the org with `sf org display --target-org <alias>`.
3. If a write may have been sent (`mutation: unknown`), inspect the transform in Data Cloud first.
4. Rerun the command.

## Example output

```text
Deploy execution: blocked (TRANSFORM_CONNECTION_DRIFT). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_CONNECTION_DRIFT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The connection to the org changed while the command was running. Check that your org login is stable, then rerun the command.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_CONNECTION_DRIFT.md
```

## Related codes

- [`TRANSFORM_TARGET_DRIFT`](../data-transform/TRANSFORM_TARGET_DRIFT.md) — the transform itself changed in the org during the run.
