# `DEPLOY_PREVIEW_FAILED`

> The preview could not finish. Read the message for the cause, such as session, selection or target access, fix it and run the preview again. Nothing was written.

|              |                                |
| ------------ | ------------------------------ |
| **Family**   | General                        |
| **Commands** | `sf data360 deploy --preview`  |
| **Outcome**  | `failed` — nothing was written |

## What it means

`sf data360 deploy --preview` stopped on an error that has no more specific code: an unexpected error while reading inputs or the target, or a data graph preview that failed or was blocked.

A preview only reads. The org is never changed by it.

## Why the plugin stops

A preview that cannot finish cannot tell you what a deploy would do. The plugin reports the failure instead of showing a partial plan.

## How to fix

1. Read the message: an HTTP status points at the org or session, a plugin check points at the input.
2. Check the session with `sf org display --target-org <alias>`.
3. Fix the cause and run the preview again.

## Example output

```text
Deploy preview: failed (DEPLOY_PREVIEW_FAILED). No deployment executed.
DEPLOY_PREVIEW_FAILED: Salesforce API rejected the request (HTTP 500); no response payload is disclosed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The preview could not finish. Read the message for the cause, such as session, selection or target access, fix it and run the preview again. Nothing was written.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_PREVIEW_FAILED.md
```

## Related codes

- [`DEPLOY_EXECUTION_FAILED`](../general/DEPLOY_EXECUTION_FAILED.md) — the same failure without `--preview`.
- [`PREFLIGHT_FAILED`](../general/PREFLIGHT_FAILED.md) — one item's preview failed inside a batch.
