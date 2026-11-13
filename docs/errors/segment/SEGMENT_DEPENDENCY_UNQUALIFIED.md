# `SEGMENT_DEPENDENCY_UNQUALIFIED`

> The DMO this segment uses does not fit what the plugin supports: a segmentable Profile DMO in the default data space whose selected field is its only Text primary key.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Segment                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was changed            |

## What it means

The plugin supports segments on one kind of DMO: segmentable, category Profile, in the default data space, where the field the SQL selects is the DMO's only primary key and has type Text. The DMO read from the org breaks one of these rules, or one of the two reads of it has an unexpected shape or more than 4096 fields.

## Why the plugin stops

Only this combination has been verified end to end. For other DMOs the plugin cannot confirm the segment behaves the same in the target org.

## How to fix

1. Check the DMO in the org: category, segmentable flag, data space and primary key.
2. Change the segment to select the DMO's Text primary key, or build it on a DMO that fits.
3. Rerun the command.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: segment:Example_Segment.
SEGMENT_DEPENDENCY_UNQUALIFIED: Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.
Hint: The DMO this segment uses does not fit what the plugin supports: a segmentable Profile DMO in the default data space whose selected field is its only Text primary key.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DEPENDENCY_UNQUALIFIED.md
```

## Related codes

- [`SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING`](../segment/SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING.md) — The DMO or field was not found exactly once.
- [`UNSUPPORTED_SEGMENT_VARIANT`](../segment/UNSUPPORTED_SEGMENT_VARIANT.md) — The segment itself is not supported.
