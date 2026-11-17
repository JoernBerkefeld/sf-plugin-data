# `SEGMENT_MEMBERS_UNEXPECTED_RESPONSE`

> Salesforce answered a member read in a shape the plugin does not expect, so no file was written. Rerun the export; if it repeats, inspect the raw API response.

|              |                                                                   |
| ------------ | ----------------------------------------------------------------- |
| **Family**   | Segment                                                           |
| **Commands** | `sf data360 segment members export`                               |
| **Outcome**  | `failed` or `blocked` — no file was left; the org was not changed |

## What it means

Salesforce answered with HTTP 200, but not in the documented shape: the segment read did not hold exactly one segment of the name, a members page had no `data` list or no `totalCount`, the detail query returned no `queryId` or no `rowCount`, or a detail rows page did not hold rows of the queried columns.

## Why the plugin stops

The plugin cannot tell which rows belong to the export from such an answer, so it writes nothing rather than an incomplete file.

## How to fix

1. Rerun the export; a temporary fault usually does not repeat.
2. If it repeats, read the route directly (for example with `sf api request rest`) and compare the answer with the Salesforce reference.

## Example output

```text
Segment members export: failed.
SEGMENT_MEMBERS_UNEXPECTED_RESPONSE: Salesforce answered the members read of segment My_Segment at offset 1000 without a data list and a totalCount. No output file was left. Nothing in the org changed.
Hint: Salesforce answered a member read in a shape the plugin does not expect, so no file was written. Rerun the export; if it repeats, inspect the raw API response.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_MEMBERS_UNEXPECTED_RESPONSE.md
```

## Related codes

- [`SEGMENT_MEMBERS_READ_FAILED`](../segment/SEGMENT_MEMBERS_READ_FAILED.md) — Salesforce answered with an error.
