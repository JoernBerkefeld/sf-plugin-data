# `SEGMENT_SELECTION_AMBIGUOUS`

> More than one segment in the default data space matches this display name or record ID and none was chosen. Rerun with an API name listed in the message.

|              |                                                        |
| ------------ | ------------------------------------------------------ |
| **Family**   | Segment                                                |
| **Commands** | `sf data360 segment members export`                    |
| **Outcome**  | `blocked` — no member was read and no file was written |

## What it means

The value in `-m segment:<value>` matched more than one segment in the default data space: their display names, or one segment's display name and another's record ID. In a terminal the export asks which one to use ("Multiple segments match that name. Choose one:"); with `--json`, without a terminal (scripts, CI), or when the question was cancelled, it stops instead.

In a test on 2026-11-17 (API 68), Salesforce refused to create or rename a segment to a display name another segment in the same data space already had (HTTP 400 "A Segment with name … already exists"), so this code is not expected in normal use. The plugin still checks, because it does not rely on that rule.

## Why the plugin stops

Picking one of the segments on its own could export the wrong members. The message lists each match with its display name, API name and record ID.

## How to fix

1. Find the segment you mean in the list printed with the error.
2. Rerun the export with `-m segment:<API name>`.

## Example output

```text
Segment members export: blocked.
SEGMENT_SELECTION_AMBIGUOUS: "Spring Audience" matches 2 segments in the default data space:
- "Spring Audience" (API name Spring_Audience, ID 1sgaj000000AAAAAAA)
- "Spring Audience" (API name Spring_Audience_2, ID 1sgaj000000BBBBBBB)
Rerun with -m segment:<API name>. No output file was left. Nothing in the org changed.
Hint: More than one segment in the default data space matches this display name or record ID and none was chosen. Rerun with an API name listed in the message.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_SELECTION_AMBIGUOUS.md
```

## Related codes

- [`SEGMENT_MEMBERS_NOT_FOUND`](../segment/SEGMENT_MEMBERS_NOT_FOUND.md) — no segment matched at all.
