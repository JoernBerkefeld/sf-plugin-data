# `CI_METADATA_MISMATCH`

> The native and Metadata API definitions of the calculated insight disagree on label, SQL or type. Nothing was written or sent; wait for the org to settle and rerun.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                                            |

## What it means

The label, SQL expression, creation type and name must be the same in the native Data 360 read and in the Metadata API read. This code means at least one of them differs.

## Why the plugin stops

The pair is built from both reads. When they disagree, the plugin cannot tell which one is current, so it writes nothing.

## How to fix

1. Wait a moment if the calculated insight was just changed, then rerun.
2. If the difference stays, open the calculated insight in Data 360 and save it again, then rerun.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_METADATA_MISMATCH: The calculated insight runtime and Metadata API definitions disagree; no files were written.
Hint: The native and Metadata API definitions of the calculated insight disagree on label, SQL or type. Nothing was written or sent; wait for the org to settle and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_METADATA_MISMATCH.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_METADATA_AMBIGUOUS`](../calculated-insight/CI_METADATA_AMBIGUOUS.md) — the Metadata API definition is missing or not unique.
