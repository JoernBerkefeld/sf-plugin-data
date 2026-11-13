# `UNSUPPORTED_DLO_FIELD_ADDITION`

> A field added to an existing DLO cannot be a primary key or a generated field. Remove it from the file or add it as an ordinary field.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data lake object                |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The DLO exists in the org, and the file lists a field the org copy does not have. That new field is either marked `isPrimaryKey: true`, or uses a name Salesforce reserves for fields it generates (a `KQ_...` key qualifier or a system field such as `DataSource__c`).

## Why the plugin stops

The primary key of a DLO is fixed at create time, and generated fields are added by Salesforce itself. Sending them as new fields would be refused or create something you did not intend, so the plugin stops before the update.

## How to fix

1. Find the new field in the file that is not in the org copy.
2. If it is meant as a key, set `isPrimaryKey` to `false`; the existing key stays.
3. If it is a generated name, remove it from the file.
4. Rerun the deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dlo:Orders__dll; mutation: not-attempted.
UNSUPPORTED_DLO_FIELD_ADDITION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Target lookup or definition admission failed; no write attempted.
Hint: A field added to an existing DLO cannot be a primary key or a generated field. Remove it from the file or add it as an ordinary field.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/UNSUPPORTED_DLO_FIELD_ADDITION.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DLO_FIELD_CHANGE`](../dlo/UNSUPPORTED_DLO_FIELD_CHANGE.md) — an existing field was changed or removed.
- [`INVALID_DLO_PRIMARY_KEY`](../dlo/INVALID_DLO_PRIMARY_KEY.md) — the file does not mark exactly one key.
- [`UNSUPPORTED_DMO_FIELD_ADDITION`](../dmo/UNSUPPORTED_DMO_FIELD_ADDITION.md) — the same check for data model objects.
