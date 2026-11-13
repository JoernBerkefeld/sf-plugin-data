# `DESTRUCTIVE_CONFIRMATION_REQUIRED`

> This delete needs explicit confirmation: a Segment, IR or CI, a selection spanning more than one phase, or a delete with --changed-since. Check it with --preview first, then rerun the delete with --confirm-delete.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | General                         |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was deleted |

## What it means

Either the selected Segment, identity resolution or calculated insight exists in the org, matches its local file and could be deleted, but `--confirm-delete` was not passed; then all read-only checks already ran and passed, and only the final confirmation is missing.

Or the selection spans more than one delete phase (for example a graph and an identity resolution, or a data stream and a DMO). Such a delete is refused before any org call without `--confirm-delete`; `--preview` needs no confirmation.

Or the delete was selected with `--changed-since <ref>`: files deleted in the Git range are deleted in the org only with `--confirm-delete`, whatever families they belong to. It is refused before any org call; `--preview` needs no confirmation.

## Why the plugin stops

A deletion cannot be undone by the plugin. Requiring the flag makes every destructive run a deliberate choice instead of a side effect of a selector.

## How to fix

1. Run the command with `--preview` to see exactly what would be deleted.
2. If that is what you want, rerun the same command with `--confirm-delete`.

## Example output

```text
Delete: blocked.
Blocked: segment:High_Value_Customers; mutation: not-attempted.
DESTRUCTIVE_CONFIRMATION_REQUIRED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Segment deletion was not attempted; input, scope, identity, definition or binding is unqualified.
Hint: This delete needs explicit confirmation: a Segment, IR or CI, a selection spanning more than one phase, or a delete with --changed-since. Check it with --preview first, then rerun the delete with --confirm-delete.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DESTRUCTIVE_CONFIRMATION_REQUIRED.md
```

## Related codes

- [`TRANSFORM_DELETE_CONFIRMATION_REQUIRED`](../data-transform/TRANSFORM_DELETE_CONFIRMATION_REQUIRED.md) — the same confirmation for data transforms.
- [`DMO_FIELD_DELETE_CONFIRMATION_REQUIRED`](../dmo/DMO_FIELD_DELETE_CONFIRMATION_REQUIRED.md) — the same confirmation for a field-level delete.
- [`DELETE_FAILED`](../general/DELETE_FAILED.md) — the general delete failure.
