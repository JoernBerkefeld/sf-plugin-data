# `DELETE_CANCELLED`

> The delete was not confirmed (no, no answer within 30 seconds, or the question failed), so nothing was sent. Rerun it and answer yes, or pass --no-prompt.

|              |                                                                    |
| ------------ | ------------------------------------------------------------------ |
| **Family**   | General                                                            |
| **Commands** | `sf data360 delete`                                                |
| **Outcome**  | `success` (exit code 0) — every item `not-attempted`, nothing sent |

## What it means

In a terminal, a delete without `--preview` or `--no-prompt` first runs the same selection read-only and then asks once, listing every component it would delete. The answer was no, no answer came within 30 seconds, or the question itself failed. No delete request was sent.

The result lists the items of that read-only run: each keeps its planned outcome, has `mutation: not-attempted` and carries this code. The run reports a `DELETE_CANCELLED` warning and ends with status `success`.

When the read-only run finds nothing to delete, no question is asked and the delete runs normally.

## Why the plugin reports it

Cancelling is a normal answer, not an error, but scripts and logs need to see that the delete did not run.

## How to fix

1. Check the listed components; run with `--preview` for the full plan.
2. Rerun the delete and answer `y`, or add `--no-prompt` (`-r`) to delete without asking.

## Example output

```text
Delete: cancelled; nothing was deleted.
Not deleted: dlo:Example__dll.
```

## Related codes

- [`CONFIRMATION_REQUIRED`](../general/CONFIRMATION_REQUIRED.md) — the delete could not ask, so it was refused.
- [`DELETE_FAILED`](../general/DELETE_FAILED.md) — the general delete failure.
