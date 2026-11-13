# `TRANSFORM_WRITE_IDENTITY_MISMATCH`

> Salesforce answered the write with a different or invalid transform ID or name. Check in Data Cloud which transform was changed before deploying again.

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Family**   | Data transform                                               |
| **Commands** | `sf data360 deploy`                                          |
| **Outcome**  | `failed` — the transform write was sent; `mutation: unknown` |

## What it means

The create or update returned a response, but its `id` is not a valid transform ID, its `name` differs from your file, or, for an update, the ID differs from `--transform-target-id`.

## Why the plugin stops

The plugin cannot verify a write whose response points at a different transform. It stops instead of reading back the wrong record and reporting success.

## How to fix

1. Open Data Cloud and check the transform named in your file and the one with the target ID.
2. Retrieve the transform to see what the org holds now.
3. Decide whether a further deploy is needed; the write may already have taken effect.

## Example output

```text
Deploy execution: failed (TRANSFORM_WRITE_IDENTITY_MISMATCH). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: unknown.
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_WRITE_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Salesforce answered the write with a different or invalid transform ID or name. Check in Data Cloud which transform was changed before deploying again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_WRITE_IDENTITY_MISMATCH.md
```

## Related codes

- [`TRANSFORM_WRITE_UNCONFIRMED`](../data-transform/TRANSFORM_WRITE_UNCONFIRMED.md) — the write response could not be read at all.
- [`TRANSFORM_READBACK_MISMATCH`](../data-transform/TRANSFORM_READBACK_MISMATCH.md) — the response was fine but the read-back definition differs.
