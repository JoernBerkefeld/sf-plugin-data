# `SEGMENT_CHILD_NOT_FOUND`

> A child segment named in spec.childSegments of a Waterfall file is not in the target org, so nothing was written. Deploy the child first (or select it in the same deploy) or fix the name.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Segment                                    |
| **Commands** | `sf data360 deploy`                        |
| **Outcome**  | `blocked` — nothing was changed in the org |

## What it means

A Waterfall segment file lists its child segments by API name in `spec.childSegments`. Salesforce stores each child by its definition ID, which differs from org to org, so the plugin reads every named child in the target org before the write and sends its ID there. The target answered HTTP 404 for the child named in the message, or the entry is not a segment API name.

## Why the plugin stops

Without the child in the target org the plugin has no ID to send for it. It stops before any write instead of sending a Waterfall without that child: the children the deploy does not select are read before the first write of the whole run.

## How to fix

1. Check the name in `spec.childSegments` (case matters).
2. Deploy the child segment first, or select it in the same deploy: the plugin then deploys the child before the Waterfall, and preview reports the Waterfall as `planned-dependencies`.
3. Run the deploy again.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: segment:Example_Waterfall.
SEGMENT_CHILD_NOT_FOUND: The child segment Example_Child of spec.childSegments is not in the target org. Deploy it first (in the same run it is deployed before the Waterfall) or correct the name; nothing was written. Segment preview is not execution authorization. Resolve the reported cause before deployment.
Hint: A child segment named in spec.childSegments of a Waterfall file is not in the target org, so nothing was written. Deploy the child first (or select it in the same deploy) or fix the name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_CHILD_NOT_FOUND.md
```

## Related codes

- [`SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING`](../segment/SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING.md) — A dependency read answered without the exact component.
- [`SEGMENT_DEPENDENCY_ACQUISITION_FAILED`](../segment/SEGMENT_DEPENDENCY_ACQUISITION_FAILED.md) — A dependency could not be read.
