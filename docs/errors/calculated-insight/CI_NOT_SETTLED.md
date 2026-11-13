# `CI_NOT_SETTLED`

> The calculated insight is in a status the plugin cannot use here, such as deleting or an error. Wait until it is ACTIVE or DRAFT, then rerun.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                                            |

## What it means

The plugin works with calculated insights whose status is ACTIVE, DRAFT or PROCESSING. This code means the org reported another status, for example DELETING or an error status, or the status did not match the one the command needs.

## Why the plugin stops

In other states the definition is changing or broken. The plugin cannot export or change it reliably.

## How to fix

1. Check the status of the calculated insight in Data 360.
2. Wait until any deletion or processing has finished, or fix the error in Data 360.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_NOT_SETTLED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The calculated insight is in a status the plugin cannot use here, such as deleting or an error. Wait until it is ACTIVE or DRAFT, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_NOT_SETTLED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_NOT_ACTIVE`](../calculated-insight/CI_NOT_ACTIVE.md) — the calculated insight is a draft or still processing.
