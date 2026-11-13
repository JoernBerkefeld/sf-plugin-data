# `UNKNOWN_SEGMENT_CONFIGURATION`

> The segment has fields or settings the plugin does not know, so saving it could lose them. Only segments with the supported set of settings can be retrieved.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

The segment read from the org has a field the plugin does not know, misses a field it requires, or has an audit or membership field in an unexpected shape.

## Why the plugin stops

The file holds only the settings the plugin knows. Dropping an unknown setting silently could change the segment the next time it is deployed.

## How to fix

1. Compare the segment with the supported shape: a SQL (DBT) segment on one DMO, without refresh schedule, with a 90-day lookback.
2. Remove the extra setting in the org if you can, then retrieve again.
3. Otherwise this segment cannot be retrieved with the plugin.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: UNKNOWN_SEGMENT_CONFIGURATION: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The segment has fields or settings the plugin does not know, so saving it could lose them. Only segments with the supported set of settings can be retrieved.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/UNKNOWN_SEGMENT_CONFIGURATION.md
Downloaded segment: 0
```

## Related codes

- [`UNSUPPORTED_SEGMENT_VARIANT`](../segment/UNSUPPORTED_SEGMENT_VARIANT.md) — A known setting with an unsupported value.
- [`INVALID_SEGMENT_DOCUMENT`](../segment/INVALID_SEGMENT_DOCUMENT.md) — A known setting with an invalid value.
