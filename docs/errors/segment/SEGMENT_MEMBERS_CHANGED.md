# `SEGMENT_MEMBERS_CHANGED`

> The segment's member count changed during the export, so a publish finished mid-read and no file was written. Run the export again.

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Family**   | Segment                                              |
| **Commands** | `sf data360 segment members export`                  |
| **Outcome**  | `failed` — no file was left; the org was not changed |

## What it means

The members route reports the total number of members on every page. It changed between two pages of the same export, which happens when a publish of the segment finished during the read.

## Why the plugin stops

Pages read before and after a publish come from two different member lists, so the file would mix them. The plugin writes the file only when every page belongs to the same list.

## How to fix

1. Wait until no publish of the segment is running.
2. Rerun the export.

## Example output

```text
Segment members export: failed.
SEGMENT_MEMBERS_CHANGED: The member count of segment My_Segment changed from 1100 to 1200 during the read (a publish finished). No output file was left. Nothing in the org changed.
Hint: The segment's member count changed during the export, so a publish finished mid-read and no file was written. Run the export again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_MEMBERS_CHANGED.md
```

## Related codes

- [`SEGMENT_MEMBERS_READ_FAILED`](../segment/SEGMENT_MEMBERS_READ_FAILED.md) — a read failed.
