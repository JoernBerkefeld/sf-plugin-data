# `CI_DELETION_UNCONFIRMED`

> The DELETE was sent but the plugin could not confirm the calculated insight is gone. Do not resend; check the org, then rerun the delete to confirm absence.

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Family**   | Calculated insight                                          |
| **Commands** | `sf data360 delete`                                         |
| **Outcome**  | `failed` — deletion may have happened (`mutation: unknown`) |

## What it means

The plugin sent one DELETE for the calculated insight, then read the org again (native and Metadata API, at most 12 reads one second apart, within 120 seconds) to prove that it is gone. This code means that proof did not succeed: the reads timed out, failed, or showed an unexpected state.

The calculated insight may or may not have been deleted.

## Why the plugin stops

A delete response alone does not prove that the calculated insight is gone. The plugin does not resend the DELETE or roll anything back, because it cannot tell whether the first request already took effect.

## How to fix

1. Do not repeat the DELETE request directly.
2. Check the calculated insight in Data 360, or read it with `sf data360 retrieve -m calculated-insight:Name__cio`.
3. Rerun the same delete command. If the calculated insight is gone, it reports `unchanged` without needing confirmation.
4. If it is still being deleted, wait and rerun.

## Example output

```text
Delete: failed.
Failed: calculated-insight:ExampleInsight__cio; mutation: unknown.
CI_DELETION_UNCONFIRMED: CI deletion may have occurred; no replay or rollback was performed.
Hint: The DELETE was sent but the plugin could not confirm the calculated insight is gone. Do not resend; check the org, then rerun the delete to confirm absence.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_DELETION_UNCONFIRMED.md
```

## Related codes

- [`CI_SETTLEMENT_TIMEOUT`](../calculated-insight/CI_SETTLEMENT_TIMEOUT.md) — the follow-up reads ran out of time.
- [`CI_ADMISSION_FAILED`](../calculated-insight/CI_ADMISSION_FAILED.md) — the delete was stopped before anything was sent.
