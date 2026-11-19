# `SEGMENT_DATASPACE_MISMATCH`

> The segment (its file's c__dataSpace, or the segment Salesforce read by that name) is in another data space than the run. Run with the --dataspace the message names, or correct c__dataSpace, then rerun.

|              |                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Segment                                                                                                                    |
| **Commands** | `sf data360 deploy`, `sf data360 delete`, `sf data360 retrieve`, `sf data360 publish`, `sf data360 segment members export` |
| **Outcome**  | `blocked` — nothing was changed (retrieve: `failed` for this segment, no files written)                                    |

## What it means

Every command runs in one data space: `--dataspace`, or `default` when you leave it out. A segment file names its data space in its top-level `c__dataSpace` key. Salesforce stores a segment of a non-default data space as `<prefix>_<Name>` (for example `ds2_Spring` in `dataspace2`), so a segment name is unique in the org and a read by name finds the segment wherever it is. This code means the file, or the segment Salesforce returned for that name, is in another data space than the run's.

## Why the plugin stops

The plugin never filters a selected component out silently. A segment of another data space is refused, so a command never changes, publishes or exports a segment in a data space you did not ask for.

## How to fix

1. Check `c__dataSpace` in the segment file, or the data space the message names for the org segment.
2. Pass `--dataspace` with that value, or leave it out when it is `default`.
3. Run segments of different data spaces in separate commands.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Data space: dataspace2.
SEGMENT_DATASPACE_MISMATCH: Spring names the data space default in c__dataSpace, but the run's data space is dataspace2 (--dataspace, default "default"). Run the command with --dataspace default, or correct the file. Deployment was refused before any write; nothing was sent to the org. Fix the reported cause, then rerun.
Hint: The segment (its file's c__dataSpace, or the segment Salesforce read by that name) is in another data space than the run. Run with the --dataspace the message names, or correct c__dataSpace, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DATASPACE_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`SEGMENT_NAME_NOT_STORED`](../segment/SEGMENT_NAME_NOT_STORED.md) — the segment file in a non-default data space has no `<prefix>_` name.
- [`SEGMENT_DEPENDENCY_OTHER_DATASPACE`](../segment/SEGMENT_DEPENDENCY_OTHER_DATASPACE.md) — the DMO or a child segment is in another data space.
- [`CI_DATASPACE_MISMATCH`](../calculated-insight/CI_DATASPACE_MISMATCH.md) — the same check for calculated insights.
