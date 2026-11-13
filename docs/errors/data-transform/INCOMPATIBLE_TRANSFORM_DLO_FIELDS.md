# `INCOMPATIBLE_TRANSFORM_DLO_FIELDS`

> The mapped source and output fields are missing, not primary keys, or defined differently. Make both fields primary keys with the same type and settings, then rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data transform                           |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The transform copies exactly one field from its source data lake object (DLO) to its output DLO. The plugin reads both DLOs from the org and compares the two mapped fields. This code means one of the fields does not exist on its DLO, one of them is not the primary key, or the two field definitions differ in something other than their name and label (for example data type or key settings).

## Why the plugin stops

The supported transform shape maps the complete primary key of the source onto the primary key of the output. If the fields do not line up, the transform would load into an output it cannot key correctly, so the plugin stops before any write instead of letting Salesforce accept a definition that cannot run as intended.

## How to fix

1. Open both DLOs in Data Cloud and find the fields named in `sourceField` and `targetField` of the `.dataTransform.json` file.
2. Make sure both fields exist and are the primary key of their DLO.
3. Make the two field definitions match (same data type and key settings); only the name and label may differ.
4. Fix the field names in the file if they are wrong, then rerun the command.

## Example output

```text
Deploy execution: blocked (INCOMPATIBLE_TRANSFORM_DLO_FIELDS). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
INCOMPATIBLE_TRANSFORM_DLO_FIELDS: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The mapped source and output fields are missing, not primary keys, or defined differently. Make both fields primary keys with the same type and settings, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INCOMPATIBLE_TRANSFORM_DLO_FIELDS.md
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_DLO_STATE`](../data-transform/UNSUPPORTED_TRANSFORM_DLO_STATE.md) — the DLOs exist but are not in a supported state.
- [`TRANSFORM_DLO_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_DLO_IDENTITY_MISMATCH.md) — the source and output resolve to the same DLO.
