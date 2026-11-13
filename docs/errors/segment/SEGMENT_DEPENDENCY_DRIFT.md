# `SEGMENT_DEPENDENCY_DRIFT`

> The DMO this segment uses changed in the org while the deploy was running, so nothing was written. Make sure nobody changes the DMO, then preview and deploy again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The deploy reads the segment's DMO before the write and again right before it. The second read differed from the first, for example in its ID or in the selected field.

## Why the plugin stops

The segment must be written against the DMO the checks confirmed. A DMO that changes in between could leave the segment pointing to the wrong data.

## How to fix

1. Find out what changed the DMO (another deploy, another person).
2. Wait until it is stable, then run the deploy with `--preview` and again without it.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: segment:Example_Segment; mutation: not-attempted.
SEGMENT_DEPENDENCY_DRIFT: Segment deployment was not attempted. Resolve input, scope, effects or target qualification.
Hint: The DMO this segment uses changed in the org while the deploy was running, so nothing was written. Make sure nobody changes the DMO, then preview and deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DEPENDENCY_DRIFT.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`SEGMENT_TARGET_DRIFT`](../segment/SEGMENT_TARGET_DRIFT.md) — The segment itself changed during the run.
- [`SEGMENT_READBACK_MISMATCH`](../segment/SEGMENT_READBACK_MISMATCH.md) — A DMO change detected after the write.
