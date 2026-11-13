# `SEGMENT_SETTLEMENT_UNQUALIFIED`

> After the write, the segment showed a status other than active, processing or counting. Inspect the segment status in the org before any further deploy.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | Segment                                                                    |
| **Commands** | `sf data360 deploy`                                                        |
| **Outcome**  | `failed` — mutation `unknown`: the change may or may not have been applied |

## What it means

After the create or update, the plugin reads the segment until it is `ACTIVE`, or `PROCESSING` or `COUNTING` after an accepted write. The segment showed another status, for example an error state.

## Why the plugin stops

The plugin cannot confirm that Salesforce accepted the definition when the segment ends up in a status it does not know.

## How to fix

1. Open the segment in the org and check its status and any error shown.
2. Fix the cause in the org or in your file, then preview the deploy again.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: segment:Example_Segment; mutation: unknown.
SEGMENT_SETTLEMENT_UNQUALIFIED: Segment mutation may have occurred. Inspect the exact target; no retry or rollback was performed.
Hint: After the write, the segment showed a status other than active, processing or counting. Inspect the segment status in the org before any further deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_SETTLEMENT_UNQUALIFIED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`SEGMENT_READBACK_MISMATCH`](../segment/SEGMENT_READBACK_MISMATCH.md) — The segment read back with a different definition.
- [`SEGMENT_TARGET_NOT_SETTLED`](../segment/SEGMENT_TARGET_NOT_SETTLED.md) — The segment was not active before the deploy.
