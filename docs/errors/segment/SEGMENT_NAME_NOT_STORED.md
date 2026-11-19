# `SEGMENT_NAME_NOT_STORED`

> In a non-default data space Salesforce stores a segment as <prefix>_<Name>; this file's name lacks the prefix, so a create could not be read back. Nothing was sent; add the prefix to the file name and identity.apiName.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

In a data space other than `default`, Salesforce stores a segment under its name with the prefix of the data space: a create of `Spring` in `dataspace2` (prefix `ds2`) stores `ds2_Spring`, and a name that already starts with `ds2_` is kept as it is (tested live on API 68, 2026-11-18). Segment files carry the name Salesforce stores; the plugin adds and strips nothing. This segment file is in a non-default data space, and its name does not start with the prefix the org names for that data space (`GET /ssot/data-spaces`).

When the org's data space list names no prefix for the run's data space, the stored name cannot be checked at all, and a segment deploy there is refused the same way.

## Why the plugin stops

Salesforce would create the segment as `<prefix>_<Name>`, and the plugin could not read it back under the name of the file: the read would find the segment of that name in `default`, or none. The deploy is refused before any write.

## How to fix

1. Rename the file and `identity.apiName` to `<prefix>_<Name>`, for example `ds2_Spring.segment.json` with `"apiName": "ds2_Spring"` (and its SQL files to `ds2_Spring.segment.<model>.sql`).
2. Or retrieve the segment from an org that has it: retrieve writes the stored name.
3. Waterfall children in that data space are named the same way in `childSegments`.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Data space: dataspace2.
SEGMENT_NAME_NOT_STORED: Salesforce stores a segment of the data space dataspace2 as ds2_<Name>, so segment Spring would be created as ds2_Spring and not be found again under the name of the file. Name the file and identity.apiName ds2_Spring, or retrieve the segment. Deployment was refused before any write; nothing was sent to the org. Fix the reported cause, then rerun.
Hint: In a non-default data space Salesforce stores a segment as <prefix>_<Name>; this file's name lacks the prefix, so a create could not be read back. Nothing was sent; add the prefix to the file name and identity.apiName.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_NAME_NOT_STORED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`SEGMENT_DATASPACE_MISMATCH`](../segment/SEGMENT_DATASPACE_MISMATCH.md) — the segment file names another data space than the run.
