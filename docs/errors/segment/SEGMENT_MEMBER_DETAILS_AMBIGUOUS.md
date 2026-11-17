# `SEGMENT_MEMBER_DETAILS_AMBIGUOUS`

> A segment member matched more than one row of the DMO the segment is built on, so --include-details cannot write one row per member. Export without --include-details.

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Family**   | Segment                                              |
| **Commands** | `sf data360 segment members export`                  |
| **Outcome**  | `failed` — no file was left; the org was not changed |

## What it means

`--include-details` joins each member of the latest membership DMO to the DMO the segment is built on. The query counts the matching rows per member; at least one member matched more than one row.

## Why the plugin stops

The detail export writes one row per member. With several matches it cannot tell which row is the member, so it writes nothing.

## How to fix

1. Export without `--include-details` to get the member IDs.
2. Check the relationship between the membership DMO and the source DMO in Data Cloud.

## Example output

```text
Segment members export: failed.
SEGMENT_MEMBER_DETAILS_AMBIGUOUS: A segment member matched 2 rows of the DMO the segment is built on; expected at most one. No output file was left. Nothing in the org changed.
Hint: A segment member matched more than one row of the DMO the segment is built on, so --include-details cannot write one row per member. Export without --include-details.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_MEMBER_DETAILS_AMBIGUOUS.md
```

## Related codes

- [`SEGMENT_MEMBER_DETAILS_UNAVAILABLE`](../segment/SEGMENT_MEMBER_DETAILS_UNAVAILABLE.md) — the join cannot be built at all.
