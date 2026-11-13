# `CI_MUTATION_UNCONFIRMED`

> The deploy request was sent but the plugin could not confirm the result. Do not resend; preview or retrieve the calculated insight to see its state first.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Calculated insight                                            |
| **Commands** | `sf data360 deploy`                                           |
| **Outcome**  | `failed` — the change may have happened (`mutation: unknown`) |

## What it means

Deploy sent one create (POST) or update (PATCH) for the calculated insight, then read the org again (at most 12 reads one second apart, within 120 seconds) to confirm it is in the expected DRAFT or ACTIVE state with the expected content. This code means that confirmation did not succeed.

The calculated insight may or may not have changed.

## Why the plugin stops

A response alone does not prove the change. The plugin sends each write once and does not retry or roll back, because a second request could duplicate or undo work.

## How to fix

1. Do not repeat the request directly.
2. Run the same deploy with `--preview`: `unchanged` means the change is in place.
3. Or retrieve the calculated insight and compare it with your pair.
4. If it is still processing, wait and check again.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: calculated-insight:ExampleInsight__cio; mutation: unknown.
CI_MUTATION_UNCONFIRMED: CI mutation may have occurred; no replay or rollback was performed.
Hint: The deploy request was sent but the plugin could not confirm the result. Do not resend; preview or retrieve the calculated insight to see its state first.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_MUTATION_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
```

## Related codes

- [`CI_SETTLEMENT_TIMEOUT`](../calculated-insight/CI_SETTLEMENT_TIMEOUT.md) — the follow-up reads ran out of time.
- [`CI_ADMISSION_FAILED`](../calculated-insight/CI_ADMISSION_FAILED.md) — the deploy was stopped before anything was sent.
