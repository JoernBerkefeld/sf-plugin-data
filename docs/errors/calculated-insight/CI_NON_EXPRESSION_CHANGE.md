# `CI_NON_EXPRESSION_CHANGE`

> The pair changes more than the SQL expression of an existing calculated insight. Only the expression can be updated; set the other fields back to the org values.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Calculated insight              |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

For a calculated insight that already exists, deploy can only change the SQL expression. This code means the pair also differs in another field, for example the label. The deploy result shows this under `CI_ADMISSION_FAILED`.

## Why the plugin stops

Only the expression update has been verified against the API. Other changes would be sent without a checked way to confirm them.

## How to fix

1. Retrieve the calculated insight again.
2. Change only the SQL expression, to one of the supported expressions.
3. Rerun the deploy with `--preview`, then without it.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: calculated-insight:ExampleInsight__cio.
CI_NON_EXPRESSION_CHANGE: Native CI intent, scope, content or dependencies are unqualified.
Hint: The pair changes more than the SQL expression of an existing calculated insight. Only the expression can be updated; set the other fields back to the org values.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_NON_EXPRESSION_CHANGE.md
```

## Related codes

- [`CI_ADMISSION_FAILED`](../calculated-insight/CI_ADMISSION_FAILED.md) — how deploy reports a failed check.
- [`CI_EXPRESSION_UNQUALIFIED`](../calculated-insight/CI_EXPRESSION_UNQUALIFIED.md) — the new expression itself is not supported.
