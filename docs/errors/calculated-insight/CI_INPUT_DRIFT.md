# `CI_INPUT_DRIFT`

> The delete options changed while the command was running, so nothing was deleted. Rerun the delete once with the intended flags.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Calculated insight              |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Delete records the selector, `--source-dir` and the other flags at the start and checks them again before each step. This code means they no longer matched. The delete result shows this under `CI_ADMISSION_FAILED`.

## Why the plugin stops

A delete is not reversible. The plugin deletes only when the request is exactly the one that was checked.

## How to fix

1. Rerun the delete with the intended `-m calculated-insight:Name__cio`, `--source-dir` and `--confirm-delete`.
2. Do not run the command from a wrapper that changes its options during the run.

## Example output

```text
Delete: blocked.
Blocked: calculated-insight:ExampleInsight__cio; mutation: not-attempted.
CI_INPUT_DRIFT: CI deletion was not attempted; paired input, scope, ownership, dependencies or intent are unqualified.
Hint: The delete options changed while the command was running, so nothing was deleted. Rerun the delete once with the intended flags.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_INPUT_DRIFT.md
```

## Related codes

- [`CI_ADMISSION_FAILED`](../calculated-insight/CI_ADMISSION_FAILED.md) — how delete reports a failed check.
