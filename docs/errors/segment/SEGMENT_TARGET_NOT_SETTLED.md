# `SEGMENT_TARGET_NOT_SETTLED`

> The existing segment is not active yet, for example still processing or counting. Wait until it shows as active in the org, then run the deploy again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The segment exists in the org but its status is not `ACTIVE`, for example `PROCESSING` or `COUNTING` after an earlier change.

## Why the plugin stops

Only an active segment is a settled state the plugin can compare against and update safely.

## How to fix

1. Wait until the segment is `ACTIVE` in the org.
2. Run the deploy again, with `--preview` first.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: segment:Example_Segment.
SEGMENT_TARGET_NOT_SETTLED: Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.
Hint: The existing segment is not active yet, for example still processing or counting. Wait until it shows as active in the org, then run the deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_TARGET_NOT_SETTLED.md
```

## Related codes

- [`SEGMENT_TARGET_DRIFT`](../segment/SEGMENT_TARGET_DRIFT.md) — The segment changed during the run.
- [`SEGMENT_SETTLEMENT_UNQUALIFIED`](../segment/SEGMENT_SETTLEMENT_UNQUALIFIED.md) — An unexpected status after a write.
