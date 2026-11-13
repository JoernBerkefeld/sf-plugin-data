# `DMO_FIELD_REMOVAL_PLANNED`

> Fields missing from the DMO file will be removed from the org. If that is not what you want, add them back to the file before you deploy.

|              |                                                                                     |
| ------------ | ----------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                   |
| **Commands** | `sf data360 deploy`                                                                 |
| **Outcome**  | informational — preview only; nothing was changed and the exit status is unaffected |

## What it means

`sf data360 deploy --preview --allow-field-removal` found custom fields on the DMO in the org that the file does not list. The real deploy will remove them with one Metadata API destructive change after any PATCH. The message lists the fields and, when the same deploy selects mapping files that drop their pairs, notes that Salesforce drops those pairs together with the fields.

## Why the plugin reports it

Field removal deletes the fields and their data and cannot be undone. The preview names each field so you can check the list before you run the deploy for real.

## How to fix

Nothing to fix if the list is what you intend; run the deploy without `--preview`.

If a field should stay, add it back to the `.dmo-meta.json` file, or deploy without `--allow-field-removal` (the deploy is then blocked instead of removing anything).

## Example output

```text
Deploy preview: success. No deployment executed.
Planned update: dmo:Customer__dlm.
DMO_FIELD_REMOVAL_PLANNED: Fields missing from the file are removed with one Metadata API destructive change: Nickname__c.
Hint: Fields missing from the DMO file will be removed from the org. If that is not what you want, add them back to the file before you deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_FIELD_REMOVAL_PLANNED.md
```

## Related codes

- [`DMO_FIELD_REMOVAL_MAPPED`](../dmo/DMO_FIELD_REMOVAL_MAPPED.md) — a field that would be removed is still mapped.
- [`UNSUPPORTED_DMO_FIELD_CHANGE`](../dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md) — the same missing field without --allow-field-removal.
