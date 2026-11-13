# `UNSUPPORTED_SEGMENT_VARIANT`

> This kind of segment is not supported. Only SQL (DBT) segments with one model, no parameters, no refresh schedule and a 90-day lookback on one DMO can be saved.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

The plugin supports one kind of segment: type DBT with exactly one SQL model, publish interval `NO_REFRESH`, lookback `P90D`, built on a DMO in the default data space, without parameters. The segment uses another type or value, more than one model, or parameters.

## Why the plugin stops

Other segment kinds have not been verified for retrieve and deploy. The plugin refuses them instead of saving a file it may not deploy correctly.

## How to fix

1. Check the segment type, refresh schedule, lookback and models in the org.
2. Use a segment of the supported kind, or manage this segment in the org directly.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: UNSUPPORTED_SEGMENT_VARIANT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: This kind of segment is not supported. Only SQL (DBT) segments with one model, no parameters, no refresh schedule and a 90-day lookback on one DMO can be saved.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/UNSUPPORTED_SEGMENT_VARIANT.md
Downloaded segment: 0
```

## Related codes

- [`UNKNOWN_SEGMENT_CONFIGURATION`](../segment/UNKNOWN_SEGMENT_CONFIGURATION.md) — The segment has settings the plugin does not know.
- [`SQL_DEPENDENCIES_UNQUALIFIED`](../segment/SQL_DEPENDENCIES_UNQUALIFIED.md) — The SQL is not in the supported shape.
