# `DEPLOY_PREVIEW_BLOCKED`

> The preview found at least one item that a deploy would refuse. Read the item lines above for the reason and fix it before running the deploy without --preview.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | General                                                        |
| **Commands** | `sf data360 deploy --preview`                                  |
| **Outcome**  | `blocked` — informational for the preview; nothing was written |

## What it means

This is the summary code of `sf data360 deploy --preview` for a batch with Segment, calculated insight, identity resolution or DMO inputs. At least one item would be blocked by the real deploy. The item lines show which one and why.

## Why the plugin stops

A preview is a dry run of every check the deploy would make. Reporting `blocked` now saves a real run that would stop at the same item.

## How to fix

1. Find the item marked `Planned blocked` and read the code under it.
2. Fix that cause (file content, target state, scope).
3. Run the preview again until it shows no blocked items, then run the deploy without `--preview`.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned unchanged: dmo:Customer__dlm.
Planned blocked: calculated-insight:Lifetime_Value__cio.
CI_NON_EXPRESSION_CHANGE: <message from the calculated insight checks>
Hint: The pair changes more than the SQL expression of an existing calculated insight. Only the expression can be updated; set the other fields back to the org values.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_NON_EXPRESSION_CHANGE.md
DEPLOY_PREVIEW_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The preview found at least one item that a deploy would refuse. Read the item lines above for the reason and fix it before running the deploy without --preview.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_PREVIEW_BLOCKED.md
```

## Related codes

- [`DEPLOY_EXECUTION_BLOCKED`](../general/DEPLOY_EXECUTION_BLOCKED.md) — the same situation in a real deploy.
- [`PREFLIGHT_FAILED`](../general/PREFLIGHT_FAILED.md) — a preview check failed rather than refused.
