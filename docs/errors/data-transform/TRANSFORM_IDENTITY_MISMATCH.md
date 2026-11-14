# `TRANSFORM_IDENTITY_MISMATCH`

> The transform read from the org does not match the requested name or ID, for example a name that differs only in letter case. Use the name exactly as in the org, then rerun.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The plugin asked for one transform and the response carried a different or invalid ID or name. For deploy, the transform found by name (ignoring letter case) has an API name that differs from the name in your file, for example `Orders_Copy` in the file and `orders_copy` in the org.

## Why the plugin stops

Writing or saving under the wrong identity would update a different transform or store one transform under another name. The plugin stops as soon as the identities disagree.

## How to fix

1. Look up the transform in Data Cloud and note its API name.
2. Use that name exactly, in the file (`definition.name` and the file name) or in `--metadata data-transform:<Name>`.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (TRANSFORM_IDENTITY_MISMATCH). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The transform read from the org does not match the requested name or ID, for example a name that differs only in letter case. Use the name exactly as in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_IDENTITY_MISMATCH.md
```

## Related codes

- [`TRANSFORM_DELETE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_DELETE_IDENTITY_MISMATCH.md) — the ID and name are not paired in the transform list.
- [`TRANSFORM_TARGET_NOT_RESOLVED`](../data-transform/TRANSFORM_TARGET_NOT_RESOLVED.md) — the name matches more than one transform.
- [`TRANSFORM_WRITE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_WRITE_IDENTITY_MISMATCH.md) — the write response names a different transform.
