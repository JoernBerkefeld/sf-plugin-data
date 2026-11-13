# `DMO_FIELD_DELETE_CONFIRMATION_REQUIRED`

> Deleting DMO fields needs explicit confirmation. Rerun with --confirm-delete, or with --preview to see which fields and mapping pairs would go.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | Data model object                |
| **Commands** | `sf data360 delete`              |
| **Outcome**  | `blocked` — no org call was made |

## What it means

`sf data360 delete -m dmo:<Name>__dlm --field <Field>__c` removes custom fields from a data model object. Salesforce drops every mapping pair that targets those fields at the same time. You ran it without `--confirm-delete` and without `--preview`.

## Why the plugin stops

A field delete is permanent, removes the field's data, and changes mappings you did not select. The plugin asks for an explicit flag so it never happens by accident.

## How to fix

1. Run the same command with `--preview` to see the fields, the mapping pairs Salesforce will drop and the files that will be refreshed.
2. When the plan is right, run it with `--confirm-delete`:

```sh
sf data360 delete --target-org my-org -m dmo:Customer__dlm --field Nickname__c --confirm-delete
```

## Example output

```text
Delete: blocked.
Blocked: dmo:Customer__dlm field Nickname__c; mutation: not-attempted.
DMO_FIELD_DELETE_CONFIRMATION_REQUIRED: Pass --confirm-delete to delete the field(s) together with their mapping pairs; nothing was changed.
Hint: Deleting DMO fields needs explicit confirmation. Rerun with --confirm-delete, or with --preview to see which fields and mapping pairs would go.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_FIELD_DELETE_CONFIRMATION_REQUIRED.md
```

## Related codes

- [`INVALID_FIELD_DELETE_SELECTION`](../general/INVALID_FIELD_DELETE_SELECTION.md) — the --field selection itself is not valid.
- [`DMO_FIELD_REMOVAL_MAPPED`](../dmo/DMO_FIELD_REMOVAL_MAPPED.md) — a mapped field whose pair cannot be identified.
