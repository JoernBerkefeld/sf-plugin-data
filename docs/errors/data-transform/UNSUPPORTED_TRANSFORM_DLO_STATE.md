# `UNSUPPORTED_TRANSFORM_DLO_STATE`

> The source or output DLO is not active or not in the Other category. Activate it or pick DLOs that are, then rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data transform                           |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The plugin found the source and output DLOs in the org, but at least one of them is not `ACTIVE`, or its category is not `Other` (for example a Profile or Engagement DLO).

## Why the plugin stops

Transforms are only handled between active DLOs in the `Other` category. DLOs in other states or categories carry rules the plugin does not check, so it does not create, update or delete transforms that depend on them.

## How to fix

1. Open both DLOs in Data Cloud and check their status and category.
2. Wait until they are active, or point the transform at active `Other` DLOs.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (UNSUPPORTED_TRANSFORM_DLO_STATE). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
UNSUPPORTED_TRANSFORM_DLO_STATE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The source or output DLO is not active or not in the Other category. Activate it or pick DLOs that are, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_DLO_STATE.md
```

## Related codes

- [`INCOMPATIBLE_TRANSFORM_DLO_FIELDS`](../data-transform/INCOMPATIBLE_TRANSFORM_DLO_FIELDS.md) — the DLOs are usable but their mapped fields do not match.
- [`TRANSFORM_DLO_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_DLO_IDENTITY_MISMATCH.md) — source and output resolve to the same DLO.
