# `SEGMENT_CREATE_AND_TARGET_UNQUALIFIED`

> The plugin could neither prove that the segment is absent nor read it completely, so it cannot choose between create and update. Use API 68, check the read error, and preview again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before deploying a segment, the plugin reads the target segment by name. A create is allowed only when Salesforce answers at API 68 with HTTP 404 and the single error `ITEM_NOT_FOUND`. An update or no-op needs a complete, readable existing segment.

Neither happened: the read failed in another way, the command runs at API 65 (where absence is not accepted as proof), or the existing segment could not be read in full.

## Why the plugin stops

Treating an unclear read as "absent" could create a duplicate or overwrite a segment the plugin never saw. The plugin stops instead of guessing.

## How to fix

1. Use API 68: leave out `--api-version` or set it to `68.0`.
2. Read the message for the HTTP status or the more specific segment code and fix that cause.
3. Retrieve the target segment with `sf data360 retrieve -m segment:<Name>` to see whether it can be read.
4. Run the deploy with `--preview` again.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: segment:Example_Segment.
SEGMENT_CREATE_AND_TARGET_UNQUALIFIED: Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.
Hint: The plugin could neither prove that the segment is absent nor read it completely, so it cannot choose between create and update. Use API 68, check the read error, and preview again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_CREATE_AND_TARGET_UNQUALIFIED.md
```

## Related codes

- [`SEGMENT_ACQUISITION_FAILED`](../segment/SEGMENT_ACQUISITION_FAILED.md) — The same read failure during a retrieve.
- [`SEGMENT_TARGET_UNQUALIFIED`](../segment/SEGMENT_TARGET_UNQUALIFIED.md) — Reported by the execution when its fresh preview is blocked.
