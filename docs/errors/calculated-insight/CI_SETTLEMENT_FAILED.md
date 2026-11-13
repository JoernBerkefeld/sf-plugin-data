# `CI_SETTLEMENT_FAILED`

> The plugin could not finish checking the result after the write. Do not resend; inspect the calculated insight in the org before another attempt.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Calculated insight                                             |
| **Commands** | `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `failed` — the change may have happened (`mutation: unknown`)  |

## What it means

After a create, update, publish or delete, the plugin reads the calculated insight again to confirm the result. This code means those reads stopped with an unexpected error. The command result shows this under `CI_MUTATION_UNCONFIRMED`, `CI_PUBLICATION_UNCONFIRMED` or `CI_DELETION_UNCONFIRMED`.

## Why the plugin stops

Without a completed check the outcome of the write is unknown. The plugin does not resend or roll back.

## How to fix

1. Do not repeat the request directly.
2. Rerun the same command with `--preview`, or retrieve the calculated insight, to see its current state.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: calculated-insight:ExampleInsight__cio; mutation: unknown.
CI_SETTLEMENT_FAILED: CI mutation may have occurred; no replay or rollback was performed.
Hint: The plugin could not finish checking the result after the write. Do not resend; inspect the calculated insight in the org before another attempt.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_SETTLEMENT_FAILED.md
Mutation may have occurred. Inspect target before any further attempt.
```

## Related codes

- [`CI_MUTATION_UNCONFIRMED`](../calculated-insight/CI_MUTATION_UNCONFIRMED.md) — how deploy reports an unconfirmed write.
- [`CI_SETTLEMENT_TIMEOUT`](../calculated-insight/CI_SETTLEMENT_TIMEOUT.md) — the checks ran out of time.
