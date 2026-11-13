# `UNSUPPORTED_DMO_FIELD_CHANGE`

> The file changes or removes a DMO field in a way the plugin cannot apply. Restore it as in the org; to remove a custom field, deploy with --allow-field-removal.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data model object                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

On an existing DMO the plugin compares every field in the org with the file. One of these applies; the message names the field and property:

- a custom field is missing from the file and `--allow-field-removal` is not set;
- the primary-key field is missing from the file (it is never removed);
- a property that cannot change differs: `dataType`, `isPrimaryKey`, read-only keys such as `creationType` or `usageTag`, or anything on a generated field;
- on a standard DMO, a listed standard or system field differs from the org.

On `delete --field` it means a named field is the primary key, or a standard, generated or system field.

## Why the plugin stops

Salesforce accepts some of these edits and silently ignores them, and rejects others. Standard, system and key fields are never removed. The plugin refuses the change before any write so the result is never a half-applied definition.

## How to fix

1. Retrieve the DMO from the target org into a scratch folder and compare the field named in the message.
2. Copy the org's value for that property back into your file.
3. To remove a custom field on purpose, add `--allow-field-removal` (preview first) or use `sf data360 delete -m dmo:<Name>__dlm --field <Field>__c --confirm-delete`.
4. To change a data type, add a new field instead.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dmo:Customer__dlm; mutation: not-attempted.
UNSUPPORTED_DMO_FIELD_CHANGE: Plugin verification failed during update field preservation for "Customer__dlm": fields.Nickname__c: expected [redacted]; observed [missing]. A custom field missing from the file is removed only with --allow-field-removal. No write attempted; correct the reported check before another attempt.
Hint: The file changes or removes a DMO field in a way the plugin cannot apply. Restore it as in the org; to remove a custom field, deploy with --allow-field-removal.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`DMO_FIELD_REMOVAL_PLANNED`](../dmo/DMO_FIELD_REMOVAL_PLANNED.md) — what the preview reports with --allow-field-removal.
- [`UNSUPPORTED_DMO_FIELD_ADDITION`](../dmo/UNSUPPORTED_DMO_FIELD_ADDITION.md) — a new field that cannot be added.
- [`UNSUPPORTED_DLO_FIELD_CHANGE`](../dlo/UNSUPPORTED_DLO_FIELD_CHANGE.md) — the same check for data lake objects.
