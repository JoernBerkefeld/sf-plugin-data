# `IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED`

> The ruleset in the org does not match the file, or its inputs and outputs could not be verified, so nothing was deleted. Retrieve it again, compare with the file, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was deleted |

## What it means

`sf data360 delete --metadata identity-resolution:<Name> --source-dir <file>` only deletes a ruleset that matches the local file exactly. Before the delete request, the plugin reads the ruleset by name and by ID, compares it with the file, checks the DMOs it uses and the objects it creates, and reads it again to make sure nothing moved in between.

This code means one of those steps failed: the ruleset in the org differs from the file, its ID has an unexpected form, an input or output could not be verified, the file changed during the run, or the time budget ran out.

## Why the plugin stops

A delete cannot be undone. The plugin deletes only what it has positively identified as the ruleset described by your file.

## How to fix

1. Retrieve the ruleset again (`sf data360 retrieve --metadata identity-resolution:<Name>`) into a separate folder and compare it with your file.
2. If the org version is the one you want to delete, use the freshly retrieved file as `--source-dir`.
3. Rerun the delete with `--preview` first, then with `--confirm-delete`.

## Example output

```text
Delete: blocked.
Blocked: identity-resolution:Individual_Main; mutation: not-attempted.
IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED: IR deletion was not attempted; input, scope, definition, lifecycle or binding is unqualified.
Hint: The ruleset in the org does not match the file, or its inputs and outputs could not be verified, so nothing was deleted. Retrieve it again, compare with the file, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_DELETION_UNCONFIRMED`](../identity-resolution/IDENTITY_RESOLUTION_DELETION_UNCONFIRMED.md) — the delete was sent, but its result is unknown.
- [`IDENTITY_RESOLUTION_NOT_SETTLED`](../identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md) — the ruleset is still publishing or deleting.
