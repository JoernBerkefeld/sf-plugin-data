# `TRANSFORM_TARGET_DRIFT`

> The transform in the org differs from the local file or changed during the run. Nothing was changed; retrieve it again, review the difference, then rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data transform                           |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

For an update, the plugin reads the transform once while planning and again right before the write; the second read showed a different definition or schedule. For a delete, the transform in the org must match your `.dataTransform.json` file exactly, and it does not, or it changed between the checks.

## Why the plugin stops

The plugin only changes or deletes what it has just checked. If the transform in the org is not what you described, someone else may have changed it, and writing over it or deleting it would lose that change.

## How to fix

1. Retrieve the transform: `sf data360 retrieve --metadata data-transform:<Name>`.
2. Compare it with your file and decide which version is right.
3. Make sure nobody else is editing the transform, then rerun.

## Example output

```text
Delete: blocked.
Blocked: data-transform:Orders_Copy; mutation: not-attempted.
TRANSFORM_TARGET_DRIFT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The transform in the org differs from the local file or changed during the run. Nothing was changed; retrieve it again, review the difference, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_TARGET_DRIFT.md
```

## Related codes

- [`TRANSFORM_PREREQUISITE_DRIFT`](../data-transform/TRANSFORM_PREREQUISITE_DRIFT.md) — a source or output DLO changed during the run.
- [`TRANSFORM_DELETE_INPUT_DRIFT`](../data-transform/TRANSFORM_DELETE_INPUT_DRIFT.md) — the local inputs changed during the run.
