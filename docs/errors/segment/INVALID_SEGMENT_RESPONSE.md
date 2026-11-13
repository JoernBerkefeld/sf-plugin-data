# `INVALID_SEGMENT_RESPONSE`

> Salesforce answered the segment read in a shape the plugin does not expect (not exactly one segment). Rerun the retrieve; if it repeats, inspect the raw API response.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

Reading one segment by name is expected to return an object holding a `segments` list with exactly one segment. The answer had another shape: not an object, extra top-level keys, an empty list, more than one entry, or an entry that is not an object.

## Why the plugin stops

The plugin cannot tell which definition to save when the answer does not clearly describe one segment.

## How to fix

1. Run the retrieve again.
2. If it repeats, read the segment directly with `sf api request rest /services/data/v68.0/ssot/segments/<Name> -o <alias>` and look at the answer.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: INVALID_SEGMENT_RESPONSE: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: Salesforce answered the segment read in a shape the plugin does not expect (not exactly one segment). Rerun the retrieve; if it repeats, inspect the raw API response.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/INVALID_SEGMENT_RESPONSE.md
Downloaded segment: 0
```

## Related codes

- [`SEGMENT_IDENTITY_MISMATCH`](../segment/SEGMENT_IDENTITY_MISMATCH.md) — The answer holds one segment, but a different one.
- [`SEGMENT_ACQUISITION_FAILED`](../segment/SEGMENT_ACQUISITION_FAILED.md) — The read failed.
