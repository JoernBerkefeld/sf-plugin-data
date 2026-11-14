# `IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED`

> The ruleset could not be matched in the org, or its inputs and outputs could not be verified, so nothing was deleted. Check it in Data Cloud, then preview the delete again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was deleted |

## What it means

`sf data360 delete -m identity-resolution:<Name>` reads the ruleset from the org by name before the first delete; with `--changed-since` the base content of the deleted file stands in for it. Before the delete request, the plugin reads the ruleset by name and by ID, compares it with that definition, checks the DMOs it uses and the objects it creates, and reads it again to make sure nothing moved in between.

This code means one of those steps failed: the ruleset in the org differs from that definition, its ID has an unexpected form, an input or output could not be verified, the flags changed during the run, or the time budget ran out.

## Why the plugin stops

A delete cannot be undone. The plugin deletes only what it has positively identified as the selected ruleset.

## How to fix

1. Check the ruleset, the DMOs it uses and its unified objects in Data Cloud; with `--changed-since`, compare the org with the deleted file's base content.
2. Make sure nobody changes the ruleset while you delete it.
3. Rerun the delete with `--preview` first, then without it.

## Example output

```text
Delete: blocked.
Blocked: identity-resolution:Individual_Main; mutation: not-attempted.
IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED: IR deletion was not attempted; input, scope, definition, lifecycle or binding is unqualified.
Hint: The ruleset could not be matched in the org, or its inputs and outputs could not be verified, so nothing was deleted. Check it in Data Cloud, then preview the delete again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_DELETION_UNCONFIRMED`](../identity-resolution/IDENTITY_RESOLUTION_DELETION_UNCONFIRMED.md) — the delete was sent, but its result is unknown.
- [`IDENTITY_RESOLUTION_NOT_SETTLED`](../identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md) — the ruleset is still publishing or deleting.
