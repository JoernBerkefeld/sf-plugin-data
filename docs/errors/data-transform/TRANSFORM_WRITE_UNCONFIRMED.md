# `TRANSFORM_WRITE_UNCONFIRMED`

> The transform write was sent, but Salesforce did not return a readable confirmation. Check in Data Cloud whether the transform was created or updated before deploying again.

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Family**   | Data transform                                               |
| **Commands** | `sf data360 deploy`                                          |
| **Outcome**  | `failed` — the transform write was sent; `mutation: unknown` |

## What it means

The create or update request completed, but the response body was not a JSON object, so the plugin has no ID or name to verify.

## Why the plugin stops

Without a confirmation the plugin cannot know whether the write took effect. It does not retry, because a second create or update could duplicate or overwrite the first.

## How to fix

1. Open Data Cloud and check whether the transform exists and matches your file.
2. Retrieve it to compare with your file.
3. Only deploy again when you know what the org holds.

## Example output

```text
Deploy execution: failed (TRANSFORM_WRITE_UNCONFIRMED). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: unknown.
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_WRITE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The transform write was sent, but Salesforce did not return a readable confirmation. Check in Data Cloud whether the transform was created or updated before deploying again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_WRITE_UNCONFIRMED.md
```

## Related codes

- [`TRANSFORM_WRITE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_WRITE_IDENTITY_MISMATCH.md) — the response was readable but named a different transform.
- [`TRANSFORM_DEPLOY_FAILED`](../data-transform/TRANSFORM_DEPLOY_FAILED.md) — the write failed with an HTTP or other error.
