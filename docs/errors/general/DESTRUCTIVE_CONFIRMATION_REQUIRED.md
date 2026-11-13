# `DESTRUCTIVE_CONFIRMATION_REQUIRED`

> Deleting this component needs explicit confirmation. Check the target with --preview first, then rerun the delete with --confirm-delete.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | General                         |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was deleted |

## What it means

The selected Segment, identity resolution or calculated insight exists in the org, matches its local file and could be deleted, but `--confirm-delete` was not passed. These deletions remove configuration that other work may rely on, so the plugin asks you to confirm each run.

All read-only checks already ran and passed; only the final confirmation is missing.

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
Hint: Deleting this component needs explicit confirmation. Check the target with --preview first, then rerun the delete with --confirm-delete.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DESTRUCTIVE_CONFIRMATION_REQUIRED.md
```

## Related codes

- [`TRANSFORM_DELETE_CONFIRMATION_REQUIRED`](../data-transform/TRANSFORM_DELETE_CONFIRMATION_REQUIRED.md) — the same confirmation for data transforms.
- [`DMO_FIELD_DELETE_CONFIRMATION_REQUIRED`](../dmo/DMO_FIELD_DELETE_CONFIRMATION_REQUIRED.md) — the same confirmation for a field-level delete.
- [`DELETE_FAILED`](../general/DELETE_FAILED.md) — the general delete failure.
