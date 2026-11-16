# `INVALID_SEGMENT_RESPONSE`

> Salesforce answered the segment read in a shape the plugin does not expect (not exactly one segment). Rerun the retrieve; if it repeats, inspect the raw API response.

|              |                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| **Family**   | Segment                                                                                                    |
| **Commands** | `sf data360 retrieve`                                                                                      |
| **Outcome**  | warning — retrieve writes the segment as-is (verbatim) with this code as reason; it is not an item failure |

## What it means

Reading one segment by name is expected to return an object holding a `segments` list with exactly one segment. The answer had another shape: not an object, extra top-level keys, an empty list, more than one entry, or an entry that is not an object.

## Why the plugin stops

The plugin cannot tell which definition to save when the answer does not clearly describe one segment.

## How to fix

1. Run the retrieve again.
2. If it repeats, read the segment directly with `sf api request rest /services/data/v68.0/ssot/segments/<Name> -o <alias>` and look at the answer.

## Example output

```text
Retrieve: success.
Warning: segment:Example_Segment: retrieved as-is (verbatim, reason INVALID_SEGMENT_RESPONSE) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded segment: 1
```

## Related codes

- [`SEGMENT_IDENTITY_MISMATCH`](../segment/SEGMENT_IDENTITY_MISMATCH.md) — The answer holds one segment, but a different one.
- [`SEGMENT_ACQUISITION_FAILED`](../segment/SEGMENT_ACQUISITION_FAILED.md) — The read failed.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
