# `SEGMENT_NOT_FOUND`

> No segment of the org has this API name or record ID in the data space asked for or any other. Check the exact value (case matters; <prefix>_<Name> outside default) and deploy the segment first.

|             |                                                            |
| ----------- | ---------------------------------------------------------- |
| **Family**  | Segment                                                    |
| **Used by** | `resolveSegment` of the library entry `sf-plugin-data/api` |
| **Outcome** | thrown `SegmentError`; nothing was written                 |

## What it means

`resolveSegment` looked for a segment by its exact API name or record ID (`1sg…`). It read the segment list of the data space it was given and then the lists of every other data space of the org. No segment matched.

## Why the plugin stops

A caller such as `sf mcnext` needs the segment's record ID in the target org to deploy a flow. Salesforce accepts a flow whose segment is missing and drops the segment without an error, so a lookup that finds nothing has to stop the caller instead.

## How to fix

1. Check the exact value: case matters, and outside `default` a segment API name carries the prefix of its data space (`ds2_<Name>`).
2. Deploy the segment first (`sf data360 deploy -m segment:<Name>`), then run the lookup again.

## Example output

```text
SEGMENT_NOT_FOUND: No segment of the org has the API name Spring_Buyers; looked in the data space default and the org's other data spaces.
```

## Related codes

- [`SEGMENT_OTHER_DATASPACE`](../segment/SEGMENT_OTHER_DATASPACE.md) — the segment exists, in another data space.
- [`SEGMENT_ACQUISITION_FAILED`](../segment/SEGMENT_ACQUISITION_FAILED.md) — a segment list could not be read completely.
