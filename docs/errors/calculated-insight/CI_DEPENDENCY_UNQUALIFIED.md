# `CI_DEPENDENCY_UNQUALIFIED`

> The DMO the calculated insight reads is missing, disabled or has fields of the wrong type in the target org. Fix the DMO and its mapped Text fields, then rerun.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                                            |

## What it means

A calculated insight reads the DMO `ssot__DeviceApplicationEngagement__dlm` in the default data space. The plugin requires that DMO to be an enabled standard ENGAGEMENT DMO, and its fields `ssot__DeviceId__c` and `ssot__SoftwareApplicationId__c` to be Text fields that are mapped. This code means one of these conditions is not met.

## Why the plugin stops

Without the DMO and its mapped fields the SQL cannot run. Deploying or retrieving such a calculated insight would describe a configuration that does not work in this org.

## How to fix

1. Check that the DMO `ssot__DeviceApplicationEngagement__dlm` exists and is enabled in the target org.
2. Map `ssot__DeviceId__c` and `ssot__SoftwareApplicationId__c` from a data stream.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_DEPENDENCY_UNQUALIFIED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The DMO the calculated insight reads is missing, disabled or has fields of the wrong type in the target org. Fix the DMO and its mapped Text fields, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_DEPENDENCY_UNQUALIFIED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_DEPENDENCY_AMBIGUOUS`](../calculated-insight/CI_DEPENDENCY_AMBIGUOUS.md) — the DMO definition could not be identified uniquely.
