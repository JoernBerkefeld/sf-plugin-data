# `PREFLIGHT_FAILED`

> Checking this item against the target failed, so nothing was deployed. Read the message for the cause, such as session, permissions or input, fix it and run deploy --preview again.

|              |                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                        |
| **Commands** | `sf data360 deploy`                                                                            |
| **Outcome**  | `failed` — nothing was written; in a real deploy the batch ends with `DEPLOY_EXECUTION_FAILED` |

## What it means

In a batch with Segment, calculated insight, identity resolution or DMO inputs, the plugin first previews every item against the target. For one item that preview stopped on an error rather than a clear refusal: a read failed, Salesforce rejected a request, or an input check failed.

With `--preview`, `PREFLIGHT_FAILED` is also the summary code of the run.

## Why the plugin stops

The whole batch is checked before the first write. If one item cannot be checked, no item is written.

## How to fix

1. Read the message under the item. An HTTP status points at the org or permissions.
2. Check the session: `sf org display --target-org <alias>`.
3. Fix the cause and run `sf data360 deploy --preview` with the same selection until it passes.

## Example output

```text
Deploy preview: failed (PREFLIGHT_FAILED). No deployment executed.
Planned blocked: segment:High_Value_Customers.
PREFLIGHT_FAILED: Salesforce API rejected the request (HTTP 500); no response payload is disclosed. Target preview failed; no deployment was executed.
Hint: Checking this item against the target failed, so nothing was deployed. Read the message for the cause, such as session, permissions or input, fix it and run deploy --preview again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/PREFLIGHT_FAILED.md
PREFLIGHT_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: Checking this item against the target failed, so nothing was deployed. Read the message for the cause, such as session, permissions or input, fix it and run deploy --preview again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/PREFLIGHT_FAILED.md
```

## Related codes

- [`DEPLOY_PREVIEW_BLOCKED`](../general/DEPLOY_PREVIEW_BLOCKED.md) — the preview refused an item instead of failing.
- [`DEPLOY_PREVIEW_FAILED`](../general/DEPLOY_PREVIEW_FAILED.md) — a preview failed outside the per-item check.
- [`DEPLOY_EXECUTION_FAILED`](../general/DEPLOY_EXECUTION_FAILED.md) — the summary code when this happens in a real deploy.
