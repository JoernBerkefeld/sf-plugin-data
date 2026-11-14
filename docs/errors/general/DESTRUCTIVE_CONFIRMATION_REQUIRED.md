# `DESTRUCTIVE_CONFIRMATION_REQUIRED`

> A delete with --changed-since needs explicit confirmation. Check it with --preview first, then rerun the same delete with --confirm-delete.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | General                         |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was deleted |

## What it means

The delete was selected with `--changed-since <ref>` and ran without `--preview` and without `--confirm-delete`. Files deleted in the Git range are deleted in the org only with `--confirm-delete`, whatever families they belong to. The run is refused before any org call.

A delete that names its components with `-m` needs no confirmation flag; `--confirm-delete` is accepted only together with `--changed-since`.

## Why the plugin stops

A Git range can hold deletions you did not look at one by one. Requiring the flag makes deleting them in the org a deliberate choice instead of a side effect of a commit.

## How to fix

1. Run the same command with `--preview` to see exactly what would be deleted.
2. If that is what you want, rerun it with `--confirm-delete`.

## Example output

```text
Delete: blocked.
DESTRUCTIVE_CONFIRMATION_REQUIRED: Files deleted in the Git range are deleted in the org only with --confirm-delete. Check the selection with --preview, then rerun with --confirm-delete. Nothing was deleted.
Hint: A delete with --changed-since needs explicit confirmation. Check it with --preview first, then rerun the same delete with --confirm-delete.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DESTRUCTIVE_CONFIRMATION_REQUIRED.md
```

## Related codes

- [`BLOCKED_GIT_LIFECYCLE`](../general/BLOCKED_GIT_LIFECYCLE.md) — the Git range holds a change the delete cannot take as a deletion.
- [`DELETE_FAILED`](../general/DELETE_FAILED.md) — the general delete failure.
