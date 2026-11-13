# `DEPLOY_EXECUTION_BLOCKED`

> At least one item was blocked, so the deploy stopped before or between writes. Read the item lines above for the reason, fix it, then rerun the same deploy.

|              |                                                            |
| ------------ | ---------------------------------------------------------- |
| **Family**   | General                                                    |
| **Commands** | `sf data360 deploy`                                        |
| **Outcome**  | `blocked` — items after the blocked one were not attempted |

## What it means

This is the summary code of a deploy that includes Segment, calculated insight, identity resolution or DMO inputs in one ordered batch. One item was blocked, either while the whole batch was checked before the first write, or when an item was checked again right before its own write.

The item line and its own code (for example `PROCESSING_ACKNOWLEDGEMENT_REQUIRED` or `DEPLOY_FRESH_ADMISSION_BLOCKED`) name the real reason. Items written before the blocked one stay written.

## Why the plugin stops

Deploy stops at the first blocked or failed item instead of skipping it, because later items can depend on earlier ones. Nothing is retried or rolled back.

## How to fix

1. Find the item marked `Blocked` or `Not attempted` and read the code printed under it.
2. Fix that cause (missing flag, changed file, target state).
3. Rerun the same command; items that are already in the wanted state report `unchanged`.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Not attempted: segment:High_Value_Customers; mutation: not-attempted.
PROCESSING_ACKNOWLEDGEMENT_REQUIRED: Qualified Segment creates and updates require explicit --allow-processing. No batch writes were attempted.
Hint: This create or update starts processing in Data Cloud and needs your explicit consent. Check it with --preview, then rerun with --allow-processing.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/PROCESSING_ACKNOWLEDGEMENT_REQUIRED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
DEPLOY_EXECUTION_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: At least one item was blocked, so the deploy stopped before or between writes. Read the item lines above for the reason, fix it, then rerun the same deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_EXECUTION_BLOCKED.md
```

## Related codes

- [`DEPLOY_PREVIEW_BLOCKED`](../general/DEPLOY_PREVIEW_BLOCKED.md) — the same situation with `--preview`.
- [`DEPLOY_EXECUTION_FAILED`](../general/DEPLOY_EXECUTION_FAILED.md) — an item failed instead of being blocked.
- [`DEPLOY_FRESH_ADMISSION_BLOCKED`](../general/DEPLOY_FRESH_ADMISSION_BLOCKED.md) — the item was blocked by the check right before its write.
