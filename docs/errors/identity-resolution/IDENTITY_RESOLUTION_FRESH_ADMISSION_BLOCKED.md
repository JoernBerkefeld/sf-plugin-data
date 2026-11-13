# `IDENTITY_RESOLUTION_FRESH_ADMISSION_BLOCKED`

> Right before writing, a fresh check of the ruleset gave a different result than the first check, so the batch stopped. Preview again to see the current state, then rerun.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Identity resolution                                           |
| **Commands** | `sf data360 deploy`                                           |
| **Outcome**  | `blocked` — this item and the items after it were not written |

## What it means

In a batch that contains an identity resolution ruleset, the plugin checks every item before the first write and then checks the remaining items again before each write. This code means the second check of the ruleset no longer agrees with the first one: the ruleset appeared or disappeared in the org, it now needs a change the plugin cannot make, or `--allow-processing` does not cover what it now needs.

Items earlier in the batch may already have been written.

## Why the plugin stops

The plan you saw was built from the first check. When the org changes in between, writing would act on a plan that is no longer true.

## How to fix

1. Look at the item outcomes in the output to see which items were written.
2. Run `sf data360 deploy --preview` with the same selection to see the current plan.
3. Rerun the deploy once the plan is what you expect.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: identity-resolution:Individual_Main; mutation: not-attempted.
IDENTITY_RESOLUTION_FRESH_ADMISSION_BLOCKED: Dependency selection is incomplete or unsupported; no deployment was executed.
Hint: Right before writing, a fresh check of the ruleset gave a different result than the first check, so the batch stopped. Preview again to see the current state, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_FRESH_ADMISSION_BLOCKED.md
```

## Related codes

- [`DEPLOY_FRESH_ADMISSION_BLOCKED`](../general/DEPLOY_FRESH_ADMISSION_BLOCKED.md) — the batch-level report of a failed second check.
- [`IDENTITY_RESOLUTION_NOT_SETTLED`](../identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md) — a common reason the second check differs.
