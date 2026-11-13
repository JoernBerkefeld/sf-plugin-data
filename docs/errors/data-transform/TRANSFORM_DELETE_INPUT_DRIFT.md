# `TRANSFORM_DELETE_INPUT_DRIFT`

> The delete inputs or the local transform file changed while the command was running. Nothing was deleted; stop other edits to the file and rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The plugin captures the flags, the target ID and the contents of the `.dataTransform.json` file at the start and checks them again between every step. One of them changed before the DELETE was sent.

## Why the plugin stops

All org checks were made against the inputs as they were at the start. If they change, those checks no longer prove that the delete targets what you asked for.

## How to fix

1. Close editors, formatters or sync tools that may write to the transform file.
2. Rerun the same `sf data360 delete` command.

## Example output

```text
Delete: blocked.
Blocked: data-transform:Orders_Copy; mutation: not-attempted.
TRANSFORM_DELETE_INPUT_DRIFT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The delete inputs or the local transform file changed while the command was running. Nothing was deleted; stop other edits to the file and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DELETE_INPUT_DRIFT.md
```

## Related codes

- [`TRANSFORM_TARGET_DRIFT`](../data-transform/TRANSFORM_TARGET_DRIFT.md) — the transform in the org differs from the file or changed during the run.
- [`TRANSFORM_PREREQUISITE_DRIFT`](../data-transform/TRANSFORM_PREREQUISITE_DRIFT.md) — the source or output DLO changed during the run.
