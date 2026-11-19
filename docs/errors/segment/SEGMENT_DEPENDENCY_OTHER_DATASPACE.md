# `SEGMENT_DEPENDENCY_OTHER_DATASPACE`

> The DMO this segment is built on, or a Waterfall child segment, is in another data space than the segment. Name the component of the segment's own data space (<prefix>_<Name> in a non-default one), then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A segment and everything it names are in one data space: the DMO it is built on (`spec.segmentOn`) and, for a Waterfall, its child segments (`spec.childSegments`). Before any write the plugin reads each by name. A read by name finds a segment in any data space, and a DMO read names its data space (`dataSpaceName`). This code means one of them is in another data space than the segment's `c__dataSpace`.

In a non-default data space, standard DMOs and segments carry the prefix of the data space (`ds2_Individual__dlm`, `ds2_Child`); a custom DMO created there keeps its plain name.

## Why the plugin stops

Salesforce builds a segment on a DMO of its own data space, and a Waterfall takes children of its own data space. A reference into another data space would make the segment differ from the file, or fail in a way the plugin could not report clearly. The deploy stops before any write.

## How to fix

1. Name the DMO or child segment as it is stored in the segment's data space, for example `ds2_Individual__dlm` or `ds2_Child` in `dataspace2`.
2. Deploy the child segment into that data space first (or in the same run), when it does not exist there yet.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Data space: dataspace2.
SEGMENT_DEPENDENCY_OTHER_DATASPACE: The segment names the child segment Child, which is in the data space default, not in the segment's data space dataspace2. Name the component of the segment's data space (in a non-default data space Salesforce stores it as <prefix>_<Name>); nothing was written. The child segments of this Waterfall were checked before any write; nothing was written.
Hint: The DMO this segment is built on, or a Waterfall child segment, is in another data space than the segment. Name the component of the segment's own data space (<prefix>_<Name> in a non-default one), then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DEPENDENCY_OTHER_DATASPACE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`SEGMENT_CHILD_NOT_FOUND`](../segment/SEGMENT_CHILD_NOT_FOUND.md) — a child segment is not in the target org at all.
- [`SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING`](../segment/SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING.md) — the DMO was not returned under that name.
- [`SEGMENT_DATASPACE_MISMATCH`](../segment/SEGMENT_DATASPACE_MISMATCH.md) — the segment itself is in another data space than the run.
