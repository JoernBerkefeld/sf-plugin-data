# `SEGMENT_MEMBERS_NOT_FOUND`

> No segment in the run's data space has this API name, record ID or display name. Check the exact value (case matters; <prefix>_<Name> outside default) and --dataspace, then rerun the export.

|              |                                                        |
| ------------ | ------------------------------------------------------ |
| **Family**   | Segment                                                |
| **Commands** | `sf data360 segment members export`                    |
| **Outcome**  | `blocked` — no member was read and no file was written |

## What it means

The export looks for the segment in the run's data space (`--dataspace`, default `default`) before it reads any member. A value that can be an API name is read directly; when Salesforce answers HTTP 404 `ITEM_NOT_FOUND`, or the value cannot be an API name (for example a display name with spaces), the plugin searches the segment list for the exact record ID or the exact display name. Nothing matched.

## Why the plugin stops

Without the segment there are no members to read. The search is exact and case-sensitive, and it covers only the run's data space. In a non-default data space a segment API name carries the prefix of the data space (`ds2_<Name>`); a segment of the selected API name in another data space is named in the message.

## How to fix

1. Copy the segment name or its record ID (`1sg…`, from the browser address bar) from Data Cloud.
2. Rerun the export with `-m "segment:<name or ID>"`; quote values that contain spaces.

## Example output

```text
Segment members export: blocked.
SEGMENT_MEMBERS_NOT_FOUND: No segment in the data space default of the org has the API name, record ID or display name "My Segment". Check the exact value (case matters).
Hint: No segment in the run's data space has this API name, record ID or display name. Check the exact value (case matters; <prefix>_<Name> outside default) and --dataspace, then rerun the export.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_MEMBERS_NOT_FOUND.md
```

## Related codes

- [`SEGMENT_SELECTION_AMBIGUOUS`](../segment/SEGMENT_SELECTION_AMBIGUOUS.md) — several segments share the display name.
- [`SEGMENT_MEMBERS_READ_FAILED`](../segment/SEGMENT_MEMBERS_READ_FAILED.md) — another Salesforce error during the export.
