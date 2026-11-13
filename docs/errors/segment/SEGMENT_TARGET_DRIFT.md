# `SEGMENT_TARGET_DRIFT`

> The target segment changed between the deploy's checks and the write, so nothing was written. Preview the deploy again to see the current state.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Right before the write, the plugin reads the target segment again. For a create, a segment with this name now exists. For an update, the segment differs from what the preview saw or is no longer `ACTIVE`.

## Why the plugin stops

The write is planned against the state the preview saw. When that state changed, the plan no longer applies.

## How to fix

1. Check who changed the segment in the meantime.
2. Run `sf data360 deploy --source-dir <file> --preview` again and deploy only if the new plan is what you want.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: segment:Example_Segment; mutation: not-attempted.
SEGMENT_TARGET_DRIFT: Segment deployment was not attempted. Resolve input, scope, effects or target qualification.
Hint: The target segment changed between the deploy's checks and the write, so nothing was written. Preview the deploy again to see the current state.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_TARGET_DRIFT.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`SEGMENT_DEPENDENCY_DRIFT`](../segment/SEGMENT_DEPENDENCY_DRIFT.md) — The segment's DMO changed instead.
- [`SEGMENT_CREATE_CONFLICT`](../segment/SEGMENT_CREATE_CONFLICT.md) — The segment appeared only after the create was sent.
