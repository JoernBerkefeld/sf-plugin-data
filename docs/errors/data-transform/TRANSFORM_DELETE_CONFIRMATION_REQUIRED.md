# `TRANSFORM_DELETE_CONFIRMATION_REQUIRED`

> All checks passed, but the delete was not confirmed. Add --confirm-delete to delete the data transform; nothing was changed.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The selection is valid and the transform in the org matches your local file, but `--confirm-delete` was not passed. The plugin ran all of its read checks and stopped before sending the DELETE.

## Why the plugin stops

Deleting a data transform cannot be undone, so it only happens when you ask for it explicitly. Use `--preview` to see what would be deleted without needing confirmation.

## How to fix

1. Review the planned delete, for example with `--preview`.
2. Rerun the same command with `--confirm-delete`.

## Example output

```text
Delete: blocked.
Blocked: data-transform:Orders_Copy; mutation: not-attempted.
TRANSFORM_DELETE_CONFIRMATION_REQUIRED: Pass --confirm-delete to delete; nothing was changed.
Hint: All checks passed, but the delete was not confirmed. Add --confirm-delete to delete the data transform; nothing was changed.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DELETE_CONFIRMATION_REQUIRED.md
```

## Related codes

- [`INVALID_TRANSFORM_DELETE_SELECTION`](../data-transform/INVALID_TRANSFORM_DELETE_SELECTION.md) — the delete flags themselves are not valid.
