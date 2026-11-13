# `CI_SETTLEMENT_TIMEOUT`

> The calculated insight did not reach the expected state within 120 seconds after the write. Do not resend; check later and rerun the same command to confirm.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Calculated insight                                             |
| **Commands** | `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `failed` — the change may have happened (`mutation: unknown`)  |

## What it means

After a write, the plugin reads the calculated insight at most 12 times, one second apart, within 120 seconds. This code means it was still processing, or a read did not answer in time. The command result shows this under `CI_MUTATION_UNCONFIRMED`, `CI_PUBLICATION_UNCONFIRMED` or `CI_DELETION_UNCONFIRMED`.

## Why the plugin stops

The plugin does not wait without limit and does not resend the write.

## How to fix

1. Wait a few minutes.
2. Rerun the same command, with `--preview` for deploy and publish. `unchanged` means the earlier write is in place.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: calculated-insight:ExampleInsight__cio; mutation: unknown.
CI_SETTLEMENT_TIMEOUT: CI mutation may have occurred; no replay or rollback was performed.
Hint: The calculated insight did not reach the expected state within 120 seconds after the write. Do not resend; check later and rerun the same command to confirm.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_SETTLEMENT_TIMEOUT.md
Mutation may have occurred. Inspect target before any further attempt.
```

## Related codes

- [`CI_MUTATION_UNCONFIRMED`](../calculated-insight/CI_MUTATION_UNCONFIRMED.md) — how deploy reports an unconfirmed write.
- [`CI_UNEXPECTED_STATE`](../calculated-insight/CI_UNEXPECTED_STATE.md) — the status moved somewhere unexpected instead.
