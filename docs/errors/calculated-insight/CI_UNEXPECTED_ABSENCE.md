# `CI_UNEXPECTED_ABSENCE`

> After the write, the calculated insight was not found in the org. Do not resend; check the org, then rerun the same command to see the current state.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Calculated insight                                            |
| **Commands** | `sf data360 deploy`, `sf data360 publish`                     |
| **Outcome**  | `failed` — the change may have happened (`mutation: unknown`) |

## What it means

After a create, update or publish, the plugin read the org again and both reads reported the calculated insight as absent. The command result shows this under `CI_MUTATION_UNCONFIRMED` or `CI_PUBLICATION_UNCONFIRMED`.

## Why the plugin stops

The calculated insight should exist after these writes. Its absence may mean it was deleted at the same time or the write was rejected later, so the outcome is unknown.

## How to fix

1. Check the calculated insight in Data 360.
2. Rerun the deploy with `--preview`: an absent calculated insight is planned as a create with `--draft`.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: calculated-insight:ExampleInsight__cio; mutation: unknown.
CI_UNEXPECTED_ABSENCE: CI mutation may have occurred; no replay or rollback was performed.
Hint: After the write, the calculated insight was not found in the org. Do not resend; check the org, then rerun the same command to see the current state.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_UNEXPECTED_ABSENCE.md
Mutation may have occurred. Inspect target before any further attempt.
```

## Related codes

- [`CI_MUTATION_UNCONFIRMED`](../calculated-insight/CI_MUTATION_UNCONFIRMED.md) — how deploy reports an unconfirmed write.
