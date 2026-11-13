# `TRANSFORM_DLO_IDENTITY_MISMATCH`

> The source and output of the transform resolve to the same DLO in the org. Point the output at a different, existing DLO in the .dataTransform.json file and rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data transform                           |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The transform file names a source DLO and an output DLO. The plugin looked both up in the org, and both lookups returned the same DLO record.

## Why the plugin stops

A transform that reads from and writes into the same DLO would overwrite its own input. The plugin refuses that rather than letting the run destroy the source data.

## How to fix

1. Check the source `dataset.name` and output `name` in the `.dataTransform.json` file.
2. Make sure they name two different DLOs that both exist in the org.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (TRANSFORM_DLO_IDENTITY_MISMATCH). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_DLO_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The source and output of the transform resolve to the same DLO in the org. Point the output at a different, existing DLO in the .dataTransform.json file and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DLO_IDENTITY_MISMATCH.md
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_DLO_STATE`](../data-transform/UNSUPPORTED_TRANSFORM_DLO_STATE.md) — a DLO is found but not in a supported state.
- [`INCOMPATIBLE_TRANSFORM_DLO_FIELDS`](../data-transform/INCOMPATIBLE_TRANSFORM_DLO_FIELDS.md) — the DLOs are different but their mapped fields do not match.
