# `TRANSFORM_READBACK_MISMATCH`

> The transform was written, but reading it back gave a different definition. Check the transform in Data Cloud before deploying again.

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Family**   | Data transform                                               |
| **Commands** | `sf data360 deploy`                                          |
| **Outcome**  | `failed` — the transform write was sent; `mutation: unknown` |

## What it means

After the create or update, the plugin read the transform again by the ID Salesforce returned. The definition it got back differs from your file, or the ID does not match.

## Why the plugin stops

A deploy only counts as successful when the org holds exactly what was sent. The plugin reports the difference instead of claiming success, and does not retry.

## How to fix

1. Open the transform in Data Cloud and compare it with your file.
2. Retrieve it to see what the org holds: `sf data360 retrieve --metadata data-transform:<Name>` (into a separate folder or with care for `--overwrite`).
3. Decide whether to deploy again, keeping in mind the write may already have taken effect.

## Example output

```text
Deploy execution: failed (TRANSFORM_READBACK_MISMATCH). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: unknown.
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_READBACK_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The transform was written, but reading it back gave a different definition. Check the transform in Data Cloud before deploying again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_READBACK_MISMATCH.md
```

## Related codes

- [`TRANSFORM_WRITE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_WRITE_IDENTITY_MISMATCH.md) — the write response itself named a different transform.
- [`TRANSFORM_WRITE_UNCONFIRMED`](../data-transform/TRANSFORM_WRITE_UNCONFIRMED.md) — the write response could not be read at all.
