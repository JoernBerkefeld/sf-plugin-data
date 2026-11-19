# `SEGMENT_IDENTITY_MISMATCH`

> Salesforce returned a segment with a different name than requested, or without a data space. Check the exact segment name (case matters), then rerun.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

The plugin asked for `segment:<Name>` and the answer held one segment, but its API name differs from the request, or it names no data space. A segment of another data space than the run's is `SEGMENT_DATASPACE_MISMATCH`.

## Why the plugin stops

Saving the answer under the requested name would describe a different segment than the one you selected.

## How to fix

1. Check the API name of the segment in the org, including upper and lower case.
2. Retrieve it again with the exact name.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: SEGMENT_IDENTITY_MISMATCH: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: Salesforce returned a segment with a different name than requested, or without a data space. Check the exact segment name (case matters), then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_IDENTITY_MISMATCH.md
Downloaded segment: 0
```

## Related codes

- [`INVALID_SEGMENT_RESPONSE`](../segment/INVALID_SEGMENT_RESPONSE.md) — The answer did not hold exactly one segment.
- [`SEGMENT_DATASPACE_MISMATCH`](../segment/SEGMENT_DATASPACE_MISMATCH.md) — the segment is in another data space than the run.
