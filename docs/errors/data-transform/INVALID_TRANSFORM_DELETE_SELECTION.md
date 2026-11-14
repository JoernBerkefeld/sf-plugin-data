# `INVALID_TRANSFORM_DELETE_SELECTION`

> A data transform delete names it exactly as -m data-transform:<Name>; with --changed-since, the deleted file must hold the transform its file name names. Fix the selection and rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A delete selector starts with `data-transform` but is not an exact `data-transform:<Name>`, or, with `--changed-since`, the base content of a deleted `.dataTransform.json` file names a different transform than its file name. Other families may be selected in the same delete, and several transforms may be selected.

## Why the plugin stops

Deleting is irreversible. The plugin resolves a transform by its exact API name, so a selector that is not exact cannot name one transform.

## How to fix

1. Pass `-m data-transform:<Name>` with the transform's API name.
2. With `--changed-since`, restore or fix the deleted file so its definition carries the name of its file, then rerun.
3. Rerun the command. The source and output DLOs are never deleted with the transform; select them with `-m dlo:<Name>__dll` to delete them after it.

## Example output

```text
Delete: blocked.
INVALID_TRANSFORM_DELETE_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: A data transform delete names it exactly as -m data-transform:<Name>; with --changed-since, the deleted file must hold the transform its file name names. Fix the selection and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_DELETE_SELECTION.md
```

## Related codes

- [`INVALID_TRANSFORM_SCOPE`](../data-transform/INVALID_TRANSFORM_SCOPE.md) — the selection is fine but the API version or data space is not supported.
- [`TRANSFORM_TARGET_NOT_RESOLVED`](../data-transform/TRANSFORM_TARGET_NOT_RESOLVED.md) — the name matches more than one transform in the org.
