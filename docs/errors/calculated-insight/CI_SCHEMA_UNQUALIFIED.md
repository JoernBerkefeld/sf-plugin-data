# `CI_SCHEMA_UNQUALIFIED`

> The dimensions or measures of the calculated insight do not match its supported SQL. Nothing was written or sent; this calculated insight cannot be handled as is.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                                            |

## What it means

An ACTIVE calculated insight with supported SQL has exactly one dimension and one measure; a draft has none yet. This code means the org reported a different number of dimensions or measures.

## Why the plugin stops

The artifact describes exactly the dimension and measure of the supported SQL. Any other set would be lost or misdescribed.

## How to fix

1. Check the dimensions and measures of the calculated insight in Data 360.
2. If it was just published, wait until it is ACTIVE and rerun.
3. Otherwise, manage it in Data 360.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_SCHEMA_UNQUALIFIED: The calculated insight dimensions or measures are outside what the calculated insight artifact can represent; no files were written.
Hint: The dimensions or measures of the calculated insight do not match its supported SQL. Nothing was written or sent; this calculated insight cannot be handled as is.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_SCHEMA_UNQUALIFIED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_ATTRIBUTION_UNQUALIFIED`](../calculated-insight/CI_ATTRIBUTION_UNQUALIFIED.md) — a dimension or measure has an unsupported source.
- [`CI_EXPRESSION_UNQUALIFIED`](../calculated-insight/CI_EXPRESSION_UNQUALIFIED.md) — the SQL is not supported.
