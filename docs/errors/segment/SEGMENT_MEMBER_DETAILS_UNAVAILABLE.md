# `SEGMENT_MEMBER_DETAILS_UNAVAILABLE`

> The segment names no membership DMO or source DMO, or Salesforce lists no single relationship between them, so --include-details cannot join them. Export without it.

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Family**   | Segment                                              |
| **Commands** | `sf data360 segment members export`                  |
| **Outcome**  | `failed` — no file was left; the org was not changed |

## What it means

`--include-details` needs the latest membership DMO (`segmentMembershipDmo.latestTable`) and the DMO the segment is built on (`segmentOnApiName`) from the segment read, exactly one relationship between them in `/ssot/metadata` with both field names, and at least one field of the source DMO. One of these is missing.

## Why the plugin stops

Without that relationship the plugin cannot write a correct join, so it builds no query.

## How to fix

1. Export without `--include-details` to get the member IDs.
2. Check in Data Cloud that the segment was published (the membership DMO exists after a publish) and that its source DMO is related to it.

## Example output

```text
Segment members export: failed.
SEGMENT_MEMBER_DETAILS_UNAVAILABLE: Segment My_Segment names no latest membership DMO or no DMO it is built on (segmentMembershipDmo.latestTable, segmentOnApiName). No output file was left. Nothing in the org changed.
Hint: The segment names no membership DMO or source DMO, or Salesforce lists no single relationship between them, so --include-details cannot join them. Export without it.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_MEMBER_DETAILS_UNAVAILABLE.md
```

## Related codes

- [`SEGMENT_MEMBER_DETAILS_AMBIGUOUS`](../segment/SEGMENT_MEMBER_DETAILS_AMBIGUOUS.md) — a member matched several detail rows.
