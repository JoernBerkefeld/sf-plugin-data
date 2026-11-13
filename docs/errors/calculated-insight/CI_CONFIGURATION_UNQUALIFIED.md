# `CI_CONFIGURATION_UNQUALIFIED`

> The calculated insight settings, such as its schedule, are outside what the plugin supports here. Nothing was written or sent; writes need NOT_SCHEDULED and the other fields as retrieved.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                                       |

## What it means

A calculated insight artifact has a fixed set of settings: one dimension, one measure, one DMO dependency, enabled, `IN_USE`, and a schedule of `SYSTEM_MANAGED` or `NOT_SCHEDULED`. This code means a setting is outside that set.

On retrieve, the calculated insight in the org has such a setting. On deploy, publish and delete it also covers a pair with the schedule `SYSTEM_MANAGED`: retrieve can export that schedule, but the write commands accept only `NOT_SCHEDULED`.

## Why the plugin stops

The plugin writes only settings it has verified against the org. An unsupported setting would either be lost or be sent without having been checked.

## How to fix

1. Retrieve the calculated insight again and do not edit fields other than the SQL expression.
2. For deploy, publish and delete, use a calculated insight whose schedule is `NOT_SCHEDULED`.
3. If the org itself holds other settings, manage the calculated insight in Data 360.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_CONFIGURATION_UNQUALIFIED: The calculated insight settings or schema are outside what the calculated insight artifact can represent; no files were written.
Hint: The calculated insight settings, such as its schedule, are outside what the plugin supports here. Nothing was written or sent; writes need NOT_SCHEDULED and the other fields as retrieved.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_CONFIGURATION_UNQUALIFIED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_RUNTIME_PROFILE_UNQUALIFIED`](../calculated-insight/CI_RUNTIME_PROFILE_UNQUALIFIED.md) — run history, package origin or schedule details in the org.
- [`CI_EXPRESSION_UNQUALIFIED`](../calculated-insight/CI_EXPRESSION_UNQUALIFIED.md) — the SQL expression is not supported.
- [`CI_ADMISSION_FAILED`](../calculated-insight/CI_ADMISSION_FAILED.md) — how deploy, publish and delete report a failed check.
