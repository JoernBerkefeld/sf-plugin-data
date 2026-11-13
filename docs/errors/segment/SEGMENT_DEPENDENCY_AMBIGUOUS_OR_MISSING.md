# `SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING`

> The DMO this segment uses, or the field its SQL selects, was not found exactly once in the org. Create or fix the DMO and field in the target org, then rerun.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Segment                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was changed            |

## What it means

The Metadata API read of the segment's DMO did not return exactly one object, the DMO lists empty or duplicate field names, or the field the segment's SQL selects is missing from either read or present more than once.

## Why the plugin stops

The plugin binds the segment to one exact DMO and field in the target. If that binding is not unique, a deploy could attach the segment to the wrong data, so it stops.

## How to fix

1. Check that the DMO exists in the target org and has the field selected in the SQL.
2. Deploy the DMO first if it is missing, for example with `sf data360 deploy -m dmo:<Name__dlm>`.
3. Rerun the command.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: segment:Example_Segment.
SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING: Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.
Hint: The DMO this segment uses, or the field its SQL selects, was not found exactly once in the org. Create or fix the DMO and field in the target org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING.md
```

## Related codes

- [`SEGMENT_DEPENDENCY_UNQUALIFIED`](../segment/SEGMENT_DEPENDENCY_UNQUALIFIED.md) — The DMO and field exist but do not fit.
- [`SEGMENT_DEPENDENCY_ACQUISITION_FAILED`](../segment/SEGMENT_DEPENDENCY_ACQUISITION_FAILED.md) — The DMO could not be read.
