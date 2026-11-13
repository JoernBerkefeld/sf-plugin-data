# `CI_UNEXPECTED_STATE`

> After the write, the calculated insight moved to an unexpected status. Do not resend; check its status in Data 360 before another attempt.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Calculated insight                                             |
| **Commands** | `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `failed` — the change may have happened (`mutation: unknown`)  |

## What it means

After the write, the plugin expected the calculated insight to become DRAFT, ACTIVE or absent, passing only through PROCESSING (or DELETING for a delete). This code means it reached another status, for example ACTIVE after a draft update. The command result shows this under `CI_MUTATION_UNCONFIRMED`, `CI_PUBLICATION_UNCONFIRMED` or `CI_DELETION_UNCONFIRMED`.

## Why the plugin stops

The org did not behave as the write intended. Repeating the write could make things worse.

## How to fix

1. Check the status of the calculated insight in Data 360.
2. Rerun the command with `--preview` to see what the plugin would do now.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: calculated-insight:ExampleInsight__cio; mutation: unknown.
CI_UNEXPECTED_STATE: CI mutation may have occurred; no replay or rollback was performed.
Hint: After the write, the calculated insight moved to an unexpected status. Do not resend; check its status in Data 360 before another attempt.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_UNEXPECTED_STATE.md
Mutation may have occurred. Inspect target before any further attempt.
```

## Related codes

- [`CI_SETTLEMENT_TIMEOUT`](../calculated-insight/CI_SETTLEMENT_TIMEOUT.md) — it stayed in PROCESSING too long.
- [`CI_MUTATION_UNCONFIRMED`](../calculated-insight/CI_MUTATION_UNCONFIRMED.md) — how deploy reports an unconfirmed write.
