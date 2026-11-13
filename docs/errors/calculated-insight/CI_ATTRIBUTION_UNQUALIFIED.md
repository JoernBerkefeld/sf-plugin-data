# `CI_ATTRIBUTION_UNQUALIFIED`

> A dimension or measure in the org is attributed to a source field the artifact cannot hold. Nothing was written; this calculated insight cannot be retrieved by the plugin.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — no files were written for this calculated insight                                         |

## What it means

For an ACTIVE calculated insight, Data 360 reports which source field each dimension and measure comes from. The plugin accepts only attribution to `ssot__DeviceId__c` or `ssot__SoftwareApplicationId__c` of a streaming data model. This code means the org reported a different source.

The calculated insight artifact holds only a small set of supported SQL expressions, so other expressions usually stop here.

## Why the plugin stops

The artifact cannot hold the reported attribution. Writing it anyway would produce a pair that does not describe the calculated insight in the org.

## How to fix

1. Open the calculated insight in Data 360 and check its SQL and source fields.
2. If it uses a different SQL expression, it cannot be retrieved with the plugin; manage it in Data 360.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_ATTRIBUTION_UNQUALIFIED: The calculated insight field attribution is outside what the calculated insight artifact can represent; no files were written.
Hint: A dimension or measure in the org is attributed to a source field the artifact cannot hold. Nothing was written; this calculated insight cannot be retrieved by the plugin.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_ATTRIBUTION_UNQUALIFIED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_EXPRESSION_UNQUALIFIED`](../calculated-insight/CI_EXPRESSION_UNQUALIFIED.md) — the SQL expression itself is not supported.
- [`CI_SCHEMA_UNQUALIFIED`](../calculated-insight/CI_SCHEMA_UNQUALIFIED.md) — the dimensions or measures do not fit the artifact.
