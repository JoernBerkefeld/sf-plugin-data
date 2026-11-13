# `DEPLOY_EXECUTION_FAILED`

> The deploy failed and a write may already have happened. Read the item lines, inspect the target with retrieve or deploy --preview, then decide whether to rerun.

|              |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                       |
| **Commands** | `sf data360 deploy`                                                                           |
| **Outcome**  | `failed` — items marked `mutation: unknown` may have changed the org; nothing was rolled back |

## What it means

This is the summary code of a deploy that did not finish. Either an item failed during its write, a preview check failed during an execution run, or an unexpected error stopped the command. A data graph deploy that failed or was blocked also ends with this code.

When an item line says `mutation: unknown`, the request was sent and the plugin could not confirm the result.

## Why the plugin stops

After an uncertain write, repeating it could duplicate or overwrite work. The plugin stops, does not retry and does not roll back, and leaves the next step to you.

## How to fix

1. Read the item lines and the codes printed under them.
2. For items with `mutation: unknown`, look at the target: `sf data360 deploy --preview` with the same selection, or `sf data360 retrieve`.
3. Fix the cause shown in the message, then rerun the deploy. Items that already reached the wanted state report `unchanged`.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: calculated-insight:Lifetime_Value__cio; mutation: unknown.
EXECUTION_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Mutation may have occurred. Inspect target before any further attempt; no retry or rollback was performed.
Hint: A write was sent but its result could not be confirmed, so it may have taken effect. Inspect the target with retrieve or deploy --preview before running the deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/EXECUTION_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
DEPLOY_EXECUTION_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The deploy failed and a write may already have happened. Read the item lines, inspect the target with retrieve or deploy --preview, then decide whether to rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_EXECUTION_FAILED.md
```

## Related codes

- [`EXECUTION_UNCONFIRMED`](../general/EXECUTION_UNCONFIRMED.md) — the item-level code of an unconfirmed write.
- [`DEPLOY_EXECUTION_BLOCKED`](../general/DEPLOY_EXECUTION_BLOCKED.md) — an item was blocked rather than failed.
- [`DEPLOY_PREVIEW_FAILED`](../general/DEPLOY_PREVIEW_FAILED.md) — the same failure during `--preview`.
