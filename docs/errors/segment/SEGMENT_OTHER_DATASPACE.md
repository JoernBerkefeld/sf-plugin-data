# `SEGMENT_OTHER_DATASPACE`

> The segment with this API name or record ID exists, but in another data space than the one asked for. Use the segment of the right data space, or look it up in the data space the message names.

|             |                                                            |
| ----------- | ---------------------------------------------------------- |
| **Family**  | Segment                                                    |
| **Used by** | `resolveSegment` of the library entry `sf-plugin-data/api` |
| **Outcome** | thrown `SegmentError`; nothing was written                 |

## What it means

`resolveSegment` did not find the segment in the data space it was given, but found a segment with that exact API name or record ID in another data space of the org. The message names that data space.

## Why the plugin stops

A flow, its segment and its content belong to one data space (one business unit). Salesforce accepts a flow deploy whose segment belongs to another data space and drops the segment without an error, so the lookup refuses it.

## How to fix

1. For a copy to another business unit, deploy the segment into the target data space first (`sf data360 deploy --dataspace <target> --allow-cross-dataspace`), then look up its name there (`<prefix>_<Name>` outside `default`).
2. Otherwise look the segment up in the data space the message names.

This is not [`SEGMENT_DATASPACE_MISMATCH`](../segment/SEGMENT_DATASPACE_MISMATCH.md): that code is reported by the `sf data360` commands for a file or a run, while this one comes from the library lookup.

## Example output

```text
SEGMENT_OTHER_DATASPACE: The segment with the record ID 1sgaj000000PveDAAS is in the data space default, not in dataspace2.
```

## Related codes

- [`SEGMENT_NOT_FOUND`](../segment/SEGMENT_NOT_FOUND.md) — no data space of the org has the segment.
- [`SEGMENT_DATASPACE_MISMATCH`](../segment/SEGMENT_DATASPACE_MISMATCH.md) — the command-line equivalent for a file or a run.
