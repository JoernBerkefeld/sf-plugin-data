# `UNSUPPORTED_SEGMENT_VARIANT`

> This kind of segment is not supported. Only SQL (DBT) segments on a DMO with no refresh schedule, a 90-day lookback and no parameters can be saved.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`       |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

The plugin supports SQL (DBT) segments: type `DBT` with a list of SQL models, publish interval `NO_REFRESH`, lookback `P90D`, built on a DMO in the default data space, without parameters. The segment or the file uses another type, schedule, lookback or source kind, or the segment has parameters. The SQL itself is not checked; Salesforce decides about it.

## Why the plugin stops

Create and update send the SQL models with no refresh schedule and send no lookback or parameters. Another value in the file would be silently ignored, and a segment read with them could not be written back as it is, so the plugin refuses it.

## How to fix

1. Check the segment type, refresh schedule, lookback and models in the org.
2. Use a segment of the supported kind, or manage this segment in the org directly.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: UNSUPPORTED_SEGMENT_VARIANT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: This kind of segment is not supported. Only SQL (DBT) segments on a DMO with no refresh schedule, a 90-day lookback and no parameters can be saved.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/UNSUPPORTED_SEGMENT_VARIANT.md
Downloaded segment: 0
```

## Related codes

- [`UNKNOWN_SEGMENT_CONFIGURATION`](../segment/UNKNOWN_SEGMENT_CONFIGURATION.md) — The segment has settings the plugin does not know.
- [`INVALID_SEGMENT_DOCUMENT`](../segment/INVALID_SEGMENT_DOCUMENT.md) — A value is not text the plugin can keep.
