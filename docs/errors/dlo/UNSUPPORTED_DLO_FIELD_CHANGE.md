# `UNSUPPORTED_DLO_FIELD_CHANGE`

> An existing DLO field was changed or removed in the file, which Salesforce does not allow. Restore the field as it is in the org; only new fields can be added.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data lake object                |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

On an existing DLO the plugin compares every field in the org with the file. A field differs on one of the keys the file lists (for example `dataType` or `label`), or a field you created is missing from the file. The message names the field and the first difference.

Fields Salesforce generated (system fields and the key qualifier of the primary key) may be left out of the file; they are kept as they are.

## Why the plugin stops

Salesforce only adds fields to an existing DLO. It rejects a changed field, and it refuses to remove one that is in use; only external data lake objects have a route to delete a field. The plugin finds this before the update so nothing is sent.

## How to fix

1. Retrieve the DLO from the target org into a scratch folder and compare the field named in the message.
2. Copy the org's definition of that field back into your file.
3. To add data, add a new field instead of changing an old one.
4. Rerun the deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dlo:Orders__dll; mutation: not-attempted.
UNSUPPORTED_DLO_FIELD_CHANGE: Plugin verification failed during update field preservation for "Orders__dll": fields.Status__c.dataType: expected "Text"; observed "Number". Salesforce only adds fields to an existing data lake object: a changed field is rejected (HTTP 400), and removing one is refused by the Metadata API ("setup object in use"); only external data lake objects have a field delete route. Target lookup or definition admission failed; no write attempted.
Hint: An existing DLO field was changed or removed in the file, which Salesforce does not allow. Restore the field as it is in the org; only new fields can be added.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/UNSUPPORTED_DLO_FIELD_CHANGE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DLO_FIELD_ADDITION`](../dlo/UNSUPPORTED_DLO_FIELD_ADDITION.md) — a new field that cannot be added.
- [`UNSUPPORTED_DMO_FIELD_CHANGE`](../dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md) — the same check for data model objects.
