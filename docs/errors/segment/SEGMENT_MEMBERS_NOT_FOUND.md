# `SEGMENT_MEMBERS_NOT_FOUND`

> Salesforce does not know a segment with this exact API name in the default data space (HTTP 404). Check the name (case matters) and rerun the export.

|              |                                                        |
| ------------ | ------------------------------------------------------ |
| **Family**   | Segment                                                |
| **Commands** | `sf data360 segment members export`                    |
| **Outcome**  | `blocked` — no member was read and no file was written |

## What it means

The export reads the segment by its exact API name in the default data space before it reads any member. Salesforce answered HTTP 404 `ITEM_NOT_FOUND`: no segment of that name exists there.

## Why the plugin stops

Without the segment there are no members to read. The plugin does not search by label or record ID; the name in `-m segment:Name` must be the exact API name.

## How to fix

1. Check the API name of the segment in Data Cloud (case matters).
2. Rerun the export with `-m segment:<ApiName>`.

## Example output

```text
Segment members export: blocked.
SEGMENT_MEMBERS_NOT_FOUND: Segment My_Segment does not exist in the default data space of the org (HTTP 404 ITEM_NOT_FOUND). Check the exact API name.
Hint: Salesforce does not know a segment with this exact API name in the default data space (HTTP 404). Check the name (case matters) and rerun the export.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_MEMBERS_NOT_FOUND.md
```

## Related codes

- [`SEGMENT_MEMBERS_READ_FAILED`](../segment/SEGMENT_MEMBERS_READ_FAILED.md) — another Salesforce error during the export.
