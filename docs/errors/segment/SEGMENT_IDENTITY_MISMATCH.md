# `SEGMENT_IDENTITY_MISMATCH`

> Salesforce returned a segment with a different name or data space than requested. Check the exact segment name (case matters) and that it lives in the default data space.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

The plugin asked for `segment:<Name>` and the answer held one segment, but its API name or data space differs from the request. Only segments in the default data space are supported.

## Why the plugin stops

Saving the answer under the requested name would describe a different segment than the one you selected.

## How to fix

1. Check the API name of the segment in the org, including upper and lower case.
2. Check that the segment is in the default data space.
3. Retrieve it again with the exact name.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: SEGMENT_IDENTITY_MISMATCH: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: Salesforce returned a segment with a different name or data space than requested. Check the exact segment name (case matters) and that it lives in the default data space.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_IDENTITY_MISMATCH.md
Downloaded segment: 0
```

## Related codes

- [`INVALID_SEGMENT_RESPONSE`](../segment/INVALID_SEGMENT_RESPONSE.md) — The answer did not hold exactly one segment.
