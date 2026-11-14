# `SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING`

> The DMO this segment is built on (spec.segmentOn) was not returned under that exact name. Create the DMO in the target org or fix the name in the file, then rerun.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Segment                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was changed            |

## What it means

The API 68 read of the DMO named in `spec.segmentOn` answered, but not with a DMO of exactly that name and an ID.

## Why the plugin stops

The plugin binds the segment to the ID of that exact DMO in the target and checks the segment read back after a write, or before a delete, against it. Without that binding it stops.

## How to fix

1. Check that the DMO named in `spec.segmentOn` exists in the target org (the name is case-sensitive).
2. Deploy the DMO first if it is missing, for example with `sf data360 deploy -m dmo:<Name__dlm>`.
3. Rerun the command.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: segment:Example_Segment.
SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING: Segment preview is not execution authorization. Resolve the reported cause before deployment.
Hint: The DMO this segment is built on (spec.segmentOn) was not returned under that exact name. Create the DMO in the target org or fix the name in the file, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING.md
```

## Related codes

- [`SEGMENT_DEPENDENCY_ACQUISITION_FAILED`](../segment/SEGMENT_DEPENDENCY_ACQUISITION_FAILED.md) — The DMO could not be read.
