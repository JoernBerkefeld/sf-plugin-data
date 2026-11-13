# `INVALID_DMO_FIELD`

> A DMO field name or definition is not valid. Use exact custom field names ending in __c; for a field read from the org, inspect that field.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data model object                                               |
| **Commands** | `sf data360 delete`, `sf data360 retrieve`, `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

This code has three sources:

- **`delete --field`**: a value passed to `--field` is not an exact custom field API name (letters, digits and underscores, ending in `__c`). No org call is made.
- **A field read from the org**: a DMO field has no name ending in `__c`, a duplicate name, no label, no data type, conflicting `type`/`dataType` values, or a non-boolean `isPrimaryKey`.
- **A field removal request**: the list of fields to remove was empty, repeated a name or held an invalid name.

A hand-edited `.dmo-meta.json` file with an invalid field is reported on deploy as `INVALID_SOURCE` instead.

## Why the plugin stops

Field names go into Metadata API requests and are used to match fields between the file and the org. A name the plugin cannot verify is refused before it reaches a request.

## How to fix

1. For `--field`, pass the exact API name, for example `--field Nickname__c`, once per field.
2. For a field read from the org, read the DMO and check the field named in the message.
3. Rerun the command.

## Example output

```text
Delete: blocked.
Blocked: dmo:Customer__dlm field Nickname; mutation: not-attempted.
INVALID_DMO_FIELD: --field takes exact custom field API names ending in __c. No org call was made.
Hint: A DMO field name or definition is not valid. Use exact custom field names ending in __c; for a field read from the org, inspect that field.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/INVALID_DMO_FIELD.md
```

## Related codes

- [`DMO_FIELD_NOT_FOUND`](../dmo/DMO_FIELD_NOT_FOUND.md) — the name is valid but the field does not exist.
- [`INVALID_FIELD_DELETE_SELECTION`](../general/INVALID_FIELD_DELETE_SELECTION.md) — the rest of the --field selection is invalid.
