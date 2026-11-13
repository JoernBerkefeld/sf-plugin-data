# `EXECUTION_UNCONFIRMED`

> A write was sent but its result could not be confirmed, so it may have taken effect. Inspect the target with retrieve or deploy --preview before running the deploy again.

|              |                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                     |
| **Commands** | `sf data360 deploy`                                                                         |
| **Outcome**  | `failed`, mutation `unknown` — the org may have changed; nothing was retried or rolled back |

## What it means

During a batch deploy with Segment, calculated insight, identity resolution or DMO inputs, the write for this item raised an error that the family-specific code could not classify. The request may have reached Salesforce. The plugin does not know whether the change was applied.

When Salesforce returned an error, the message includes the HTTP status, error code and request ID.

## Why the plugin stops

Repeating a write whose result is unknown could apply it twice or overwrite a change. The plugin stops the batch at this item and leaves the decision to you.

## How to fix

1. Check the target: `sf data360 deploy --preview` with the same selection, or `sf data360 retrieve -m <type>:<ApiName>`.
2. If the preview shows `unchanged`, the write did take effect.
3. Otherwise fix the cause from the message and rerun the deploy.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: identity-resolution:Individual__dlm; mutation: unknown.
EXECUTION_UNCONFIRMED: Salesforce API rejected the request (HTTP 500); no response payload is disclosed. Mutation may have occurred. Inspect target before any further attempt; no retry or rollback was performed.
Hint: A write was sent but its result could not be confirmed, so it may have taken effect. Inspect the target with retrieve or deploy --preview before running the deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/EXECUTION_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
DEPLOY_EXECUTION_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The deploy failed and a write may already have happened. Read the item lines, inspect the target with retrieve or deploy --preview, then decide whether to rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_EXECUTION_FAILED.md
```

## Related codes

- [`DEPLOY_EXECUTION_FAILED`](../general/DEPLOY_EXECUTION_FAILED.md) — the summary code the deploy ends with.
- [`DEPLOY_FRESH_ADMISSION_BLOCKED`](../general/DEPLOY_FRESH_ADMISSION_BLOCKED.md) — the check before the write failed, so nothing was sent.
