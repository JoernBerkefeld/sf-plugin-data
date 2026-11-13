# `CI_EXPRESSION_UNQUALIFIED`

> The calculated insight SQL is not one of the expressions the plugin supports. Nothing was written or sent; this calculated insight cannot be handled by the plugin.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                                            |

## What it means

The plugin does not parse SQL. It supports exactly two SQL expressions: a distinct count of `ssot__DeviceId__c` grouped by `ssot__SoftwareApplicationId__c` from `ssot__DeviceApplicationEngagement__dlm` with `WHERE 1 = 0`, with or without the extra condition that `ssot__DeviceId__c` is not null. This code means the SQL is different, even by a single character.

## Why the plugin stops

The plugin builds the dimensions, measures and dependencies of the artifact from the known SQL. For any other SQL it could not describe them correctly.

## How to fix

1. Retrieve the calculated insight again and edit only between the two supported expressions.
2. For other SQL, manage the calculated insight in Data 360.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_EXPRESSION_UNQUALIFIED: The calculated insight SQL is outside what the calculated insight artifact can represent; no files were written.
Hint: The calculated insight SQL is not one of the expressions the plugin supports. Nothing was written or sent; this calculated insight cannot be handled by the plugin.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_EXPRESSION_UNQUALIFIED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_ATTRIBUTION_UNQUALIFIED`](../calculated-insight/CI_ATTRIBUTION_UNQUALIFIED.md) — often the first sign of other SQL in the org.
- [`CI_CONFIGURATION_UNQUALIFIED`](../calculated-insight/CI_CONFIGURATION_UNQUALIFIED.md) — settings other than the SQL are not supported.
