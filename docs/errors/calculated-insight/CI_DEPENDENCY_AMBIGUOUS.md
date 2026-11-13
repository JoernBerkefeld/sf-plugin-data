# `CI_DEPENDENCY_AMBIGUOUS`

> The DMO the calculated insight reads could not be identified uniquely in the target org. Check the DMO and its field list in Data 360, then rerun.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                                            |

## What it means

A calculated insight reads the DMO `ssot__DeviceApplicationEngagement__dlm`. The plugin reads that DMO through the native API and the Metadata API. This code means the Metadata API did not return exactly one definition, or a field name was missing or listed twice.

## Why the plugin stops

The plugin must confirm the exact fields the SQL uses. With an unclear DMO definition it cannot tell whether the calculated insight would work in this org.

## How to fix

1. Open the DMO `ssot__DeviceApplicationEngagement__dlm` in Data 360 and check its fields.
2. Wait for any running DMO change to finish.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_DEPENDENCY_AMBIGUOUS: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The DMO the calculated insight reads could not be identified uniquely in the target org. Check the DMO and its field list in Data 360, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_DEPENDENCY_AMBIGUOUS.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_DEPENDENCY_UNQUALIFIED`](../calculated-insight/CI_DEPENDENCY_UNQUALIFIED.md) — the DMO was found but does not qualify.
