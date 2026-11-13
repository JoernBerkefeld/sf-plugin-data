# `CI_METADATA_AMBIGUOUS`

> The Metadata API definition of the calculated insight is missing or does not match the native read. Nothing was written or sent; check the calculated insight in the org and rerun.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                                            |

## What it means

The plugin reads a calculated insight through the native Data 360 API and through the Metadata API. Both must agree that it exists, or both that it does not. This code means one read found it and the other did not, or the Metadata API returned more than one record.

A Metadata-only record without a native calculated insight is not treated as absent.

## Why the plugin stops

The plugin can neither create over a half-present calculated insight nor export one whose definition is unclear.

## How to fix

1. Check the calculated insight in Data 360 and in Setup.
2. If a create or delete is still running, wait for it to finish.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_METADATA_AMBIGUOUS: The calculated insight Metadata API definition is missing or ambiguous; no files were written.
Hint: The Metadata API definition of the calculated insight is missing or does not match the native read. Nothing was written or sent; check the calculated insight in the org and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_METADATA_AMBIGUOUS.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_METADATA_MISMATCH`](../calculated-insight/CI_METADATA_MISMATCH.md) — both definitions exist but disagree.
