# `CONFIRMATION_REQUIRED`

> Deleting needs a yes at the confirmation question, and nobody could answer it here. Run the delete in a terminal, or pass --no-prompt after checking it with --preview.

|              |                                                       |
| ------------ | ----------------------------------------------------- |
| **Family**   | General                                               |
| **Commands** | `sf data360 delete`                                   |
| **Outcome**  | `blocked` (exit code 1) — nothing was read or deleted |

## What it means

A delete without `--preview` asks once before it deletes anything. This run could not ask: standard input or output is not a terminal (a script, a pipe, CI), or `--json` was passed. Without `--no-prompt` such a run is refused before any org call, whatever it selects (`-m`, `--changed-since` or `--field`).

`--preview` never asks and is never refused for this reason.

## Why the plugin stops

A delete cannot be undone. Without a terminal there is nobody to say yes, so deleting must be a deliberate choice written into the command itself.

## How to fix

1. Run the same command with `--preview` to see exactly what would be deleted.
2. Run it in a terminal and answer the question, or add `--no-prompt` (`-r`) to delete without asking.

## Example output

```text
Delete: blocked.
CONFIRMATION_REQUIRED: Deleting needs confirmation: run it in a terminal, or pass --no-prompt. Check the selection with --preview first.
Hint: Deleting needs a yes at the confirmation question, and nobody could answer it here. Run the delete in a terminal, or pass --no-prompt after checking it with --preview.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.4.0/docs/errors/general/CONFIRMATION_REQUIRED.md
```

## Related codes

- [`DELETE_CANCELLED`](../general/DELETE_CANCELLED.md) — the question was asked and not answered with yes.
- [`DELETE_FAILED`](../general/DELETE_FAILED.md) — the general delete failure.
