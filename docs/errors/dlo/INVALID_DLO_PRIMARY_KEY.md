# `INVALID_DLO_PRIMARY_KEY`

> The DLO does not have exactly one usable primary-key field. Mark one ordinary field (not KQ_ or a system field) with isPrimaryKey true, then rerun.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data lake object                                                |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

A data lake object has exactly one primary-key field. This code has two sources:

- **Deploy of a new DLO**: before the create, the plugin leaves out the fields Salesforce generates itself (`KQ_...` key qualifiers and system fields such as `DataSource__c`). Among the remaining fields exactly one must have `isPrimaryKey: true`. This fails when the file marks a generated field as the key.
- **A definition read from the org**: the DLO in the org, as Salesforce returned it, has no primary-key field or more than one.

A local file that does not mark exactly one field is reported on deploy as `INVALID_SOURCE` instead.

## Why the plugin stops

The primary key is fixed when a DLO is created; a wrong key can only be fixed by deleting and creating the object again. The plugin refuses the create before it is sent.

## How to fix

1. Choose the ordinary field that identifies each record.
2. Set `"isPrimaryKey": true` on that field and `false` on every other one, including `KQ_...` and `cdp_sys_...` fields.
3. Rerun the deploy.
4. If the code comes from a retrieve or delete, read the DLO in the org and check its key fields.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dlo:Orders__dll; mutation: not-attempted.
INVALID_DLO_PRIMARY_KEY: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Target lookup or definition admission failed; no write attempted.
Hint: The DLO does not have exactly one usable primary-key field. Mark one ordinary field (not KQ_ or a system field) with isPrimaryKey true, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/INVALID_DLO_PRIMARY_KEY.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the local file of a deploy is invalid.
- [`UNSUPPORTED_DLO_FIELD_ADDITION`](../dlo/UNSUPPORTED_DLO_FIELD_ADDITION.md) — a primary key added to an existing DLO.
