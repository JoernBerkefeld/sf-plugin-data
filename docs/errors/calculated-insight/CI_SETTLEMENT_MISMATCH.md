# `CI_SETTLEMENT_MISMATCH`

> After the write, the calculated insight in the org differs from the pair that was sent. Do not resend; retrieve it and compare before another attempt.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Calculated insight                                             |
| **Commands** | `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `failed` — the change may have happened (`mutation: unknown`)  |

## What it means

After the write, the plugin read the calculated insight again and found a definition that differs from the pair, for example a different SQL expression or label. The command result shows this under `CI_MUTATION_UNCONFIRMED`, `CI_PUBLICATION_UNCONFIRMED` or `CI_DELETION_UNCONFIRMED`.

## Why the plugin stops

The org does not hold what was sent. Someone else may have changed it at the same time, or the write was applied differently. Resending could overwrite their change.

## How to fix

1. Retrieve the calculated insight into a separate folder and compare it with your pair.
2. Find out who or what changed it.
3. Decide on the intended state, then rerun deploy with `--preview`.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: calculated-insight:ExampleInsight__cio; mutation: unknown.
CI_SETTLEMENT_MISMATCH: CI mutation may have occurred; no replay or rollback was performed.
Hint: After the write, the calculated insight in the org differs from the pair that was sent. Do not resend; retrieve it and compare before another attempt.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_SETTLEMENT_MISMATCH.md
Mutation may have occurred. Inspect target before any further attempt.
```

## Related codes

- [`CI_MUTATION_UNCONFIRMED`](../calculated-insight/CI_MUTATION_UNCONFIRMED.md) — how deploy reports an unconfirmed write.
