# `TRANSFORM_DEPLOY_FAILED`

> The data transform deploy stopped on an error the plugin does not classify, such as an HTTP error from Salesforce. Read the message, check the transform in Data Cloud, then rerun.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 deploy`                                                          |
| **Outcome**  | `blocked` if no write was sent; `failed` with `mutation: unknown` if one was |

## What it means

Something went wrong that is not one of the specific transform checks. Common causes are an HTTP error from Salesforce (for example authentication, permissions, or a create rejected because the name already exists), a problem reading a DLO, or a change to the local file detected right before the write. The message shows the HTTP status and Salesforce error detail when there is one.

## Why the plugin stops

The plugin stops at the first unexpected error and never retries a write automatically. When a request may already have been sent, it marks the outcome as unknown instead of guessing.

## How to fix

1. Read the message: it includes the HTTP status and Salesforce error detail when available.
2. If the item shows `mutation: unknown`, check the transform in Data Cloud before doing anything else.
3. Fix the cause (login, permissions, name clash, local file) and rerun the deploy.

## Example output

```text
Deploy execution: failed (TRANSFORM_DEPLOY_FAILED). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: unknown.
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_DEPLOY_FAILED: Salesforce API rejected the request (HTTP 400); no response payload is disclosed. Salesforce API detail: INVALID_INPUT: A data transform with this name already exists. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The data transform deploy stopped on an error the plugin does not classify, such as an HTTP error from Salesforce. Read the message, check the transform in Data Cloud, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DEPLOY_FAILED.md
```

## Related codes

- [`TRANSFORM_VALIDATION_FAILED`](../data-transform/TRANSFORM_VALIDATION_FAILED.md) — Salesforce validation reported issues before the create.
- [`TRANSFORM_WRITE_UNCONFIRMED`](../data-transform/TRANSFORM_WRITE_UNCONFIRMED.md) — the write returned, but not with a usable confirmation.
