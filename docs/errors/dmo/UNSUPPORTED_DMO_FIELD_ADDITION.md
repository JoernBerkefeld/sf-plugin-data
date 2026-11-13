# `UNSUPPORTED_DMO_FIELD_ADDITION`

> This field cannot be added to the existing DMO. New fields must not be primary keys or generated, and on a standard DMO need a name without a namespace.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data model object               |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The DMO exists in the org, and the file lists a field the org copy does not have. That new field is one of these:

- marked `isPrimaryKey: true`;
- a field Salesforce generates itself (a key qualifier or system field);
- on a standard DMO (`creationType` `Standard`), a field with a namespace in its name or not marked as custom.

## Why the plugin stops

The primary key of a DMO is fixed, generated fields are added by Salesforce, and Salesforce refuses namespaced field names on a standard DMO. The plugin finds these before any write so nothing is sent.

## How to fix

1. Find the field in the file that is not in the org copy.
2. If it is meant as a key, set `isPrimaryKey` to `false`.
3. If it is a generated field, remove it from the file.
4. On a standard DMO, rename it to a plain custom field name such as `LoyaltyTier__c`.
5. Rerun the deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dmo:Individual__dlm; mutation: not-attempted.
UNSUPPORTED_DMO_FIELD_ADDITION: Plugin verification failed during standard DMO field addition for "Individual__dlm": fields.acme__Tier__c: expected [missing]; observed [redacted]. Only custom fields with a name without a namespace can be added to a standard DMO. No write attempted; correct the reported check before another attempt.
Hint: This field cannot be added to the existing DMO. New fields must not be primary keys or generated, and on a standard DMO need a name without a namespace.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/UNSUPPORTED_DMO_FIELD_ADDITION.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DMO_FIELD_CHANGE`](../dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md) — an existing field was changed or removed.
- [`UNSUPPORTED_DLO_FIELD_ADDITION`](../dlo/UNSUPPORTED_DLO_FIELD_ADDITION.md) — the same check for data lake objects.
