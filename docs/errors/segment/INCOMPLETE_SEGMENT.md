# `INCOMPLETE_SEGMENT`

> The segment read finished without a usable definition and without a more specific reason. Rerun the retrieve; if it repeats, read the segment directly with the API.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

While retrieving `segment:<Name>`, the plugin read the segment but ended up with no definition it could save, and no more specific reason was recorded.

This is a fallback code: in almost every case one of the more specific segment codes is reported instead.

## Why the plugin stops

A segment file is written only from a complete definition that passed all of the plugin's checks. Without one, any file written would be a guess.

## How to fix

1. Run the same retrieve again.
2. If it repeats, read the segment directly, for example `sf api request rest /services/data/v68.0/ssot/segments/<Name> -o <alias>`, and check that it exists in the default data space.
3. Report the case if the direct read looks normal.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: INCOMPLETE_SEGMENT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The segment read finished without a usable definition and without a more specific reason. Rerun the retrieve; if it repeats, read the segment directly with the API.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/INCOMPLETE_SEGMENT.md
Downloaded segment: 0
```

## Related codes

- [`SEGMENT_ACQUISITION_FAILED`](../segment/SEGMENT_ACQUISITION_FAILED.md) — The read itself failed.
- [`UNKNOWN_SEGMENT_CONFIGURATION`](../segment/UNKNOWN_SEGMENT_CONFIGURATION.md) — The read succeeded but contained unknown settings.
