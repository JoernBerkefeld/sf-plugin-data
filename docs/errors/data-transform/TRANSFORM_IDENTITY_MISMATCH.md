# `TRANSFORM_IDENTITY_MISMATCH`

> The transform read from the org does not match the requested name or ID. For an update, check that --transform-target-id belongs to the transform named in the file, then rerun.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The plugin asked for one transform and either the response carried a different or invalid ID or name, or, for an update, the record at `--transform-target-id` has a different API name than the transform in your file.

## Why the plugin stops

Writing or saving under the wrong identity would update a different transform or store one transform under another name. The plugin stops as soon as the identities disagree.

## How to fix

1. Look up the transform in Data Cloud and note its record ID and API name.
2. For deploy, pass the record ID of the transform whose name matches the file.
3. For retrieve, check that the name in `--metadata data-transform:<Name>` is spelled exactly as in the org.
4. Rerun the command.

## Example output

```text
Deploy execution: blocked (TRANSFORM_IDENTITY_MISMATCH). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: not-attempted.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The transform read from the org does not match the requested name or ID. For an update, check that --transform-target-id belongs to the transform named in the file, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_IDENTITY_MISMATCH.md
```

## Related codes

- [`TRANSFORM_DELETE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_DELETE_IDENTITY_MISMATCH.md) — the ID and name are not paired in the transform list.
- [`TRANSFORM_WRITE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_WRITE_IDENTITY_MISMATCH.md) — the write response names a different transform.
