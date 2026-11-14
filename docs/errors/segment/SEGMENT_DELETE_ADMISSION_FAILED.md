# `SEGMENT_DELETE_ADMISSION_FAILED`

> The checks before the segment delete failed, so nothing was deleted. Read the message, check the segment and its source DMO in Data Cloud, then preview the delete again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before deleting a segment, the plugin reads it from the org by name (with `--changed-since`: takes the base content of the deleted file) and checks that the segment in the org matches that definition exactly, that it is `ACTIVE`, `PROCESSING` or `COUNTING`, that its IDs look as expected, that the DMO it is built on still matches, and that nothing changed between two reads. It also checks that the flags and the connection stay the same and that the run stays within its time budget.

One of these checks failed, or a read failed.

## Why the plugin stops

A delete is permanent and is sent only once. The plugin deletes only the exact segment it checked.

## How to fix

1. Read the message for the failed check and look at the segment and the DMO it is built on in Data Cloud.
2. Make sure nobody changes the segment or its DMO while you delete it.
3. Run `sf data360 delete -m segment:<Name> --preview`, then the delete without `--preview`.

## Example output

```text
Delete: blocked.
Blocked: segment:Example_Segment; mutation: not-attempted.
SEGMENT_DELETE_ADMISSION_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Segment deletion was not attempted; input, scope, identity, definition or binding is unqualified.
Hint: The checks before the segment delete failed, so nothing was deleted. Read the message, check the segment and its source DMO in Data Cloud, then preview the delete again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DELETE_ADMISSION_FAILED.md
```

## Related codes

- [`SEGMENT_DELETION_UNCONFIRMED`](../segment/SEGMENT_DELETION_UNCONFIRMED.md) — The delete was sent but not confirmed.
- [`DESTRUCTIVE_CONFIRMATION_REQUIRED`](../general/DESTRUCTIVE_CONFIRMATION_REQUIRED.md) — A delete with --changed-since was run without --confirm-delete.
