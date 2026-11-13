# `DEPLOY_FRESH_ADMISSION_BLOCKED`

> Right before writing this item, a fresh check found something different from the earlier check, so it and later items were not written. Run deploy --preview to see the current state, then rerun.

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                |
| **Commands** | `sf data360 deploy`                                                                    |
| **Outcome**  | `blocked` — this item and all later items were not written; earlier items stay written |

## What it means

In a batch with Segment, calculated insight, identity resolution or DMO inputs, the plugin checks the whole selection first and then checks again right before each write. `DEPLOY_FRESH_ADMISSION_BLOCKED` means that second check failed: a selected file changed on disk, a dependency in the org changed, a target moved to a state that is no longer supported, or `--allow-processing` is needed for what the item would now do.

The message names the check that failed when the plugin can tell.

## Why the plugin stops

A write is only allowed while the facts it was planned on are still true. If something changed between planning and writing, going ahead could overwrite someone else's change or act on a dependency that is gone.

## How to fix

1. Do not edit the selected files while a deploy runs.
2. Run the same command with `--preview` to see the current target state.
3. Add `--allow-processing` if the preview now plans a create or update that needs it.
4. Rerun the deploy; items already written report `unchanged`.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
updated dmo Customer__dlm
Blocked: segment:High_Value_Customers; mutation: not-attempted.
DEPLOY_FRESH_ADMISSION_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Fresh input or dependency admission failed before this item. No further writes were attempted.
Hint: Right before writing this item, a fresh check found something different from the earlier check, so it and later items were not written. Run deploy --preview to see the current state, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_FRESH_ADMISSION_BLOCKED.md
Deployed: 1 (0 created / 1 updated / 0 failed)
DEPLOY_EXECUTION_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: At least one item was blocked, so the deploy stopped before or between writes. Read the item lines above for the reason, fix it, then rerun the same deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_EXECUTION_BLOCKED.md
```

## Related codes

- [`DEPLOY_EXECUTION_BLOCKED`](../general/DEPLOY_EXECUTION_BLOCKED.md) — the summary code the deploy ends with.
- [`SEGMENT_FRESH_ADMISSION_BLOCKED`](../segment/SEGMENT_FRESH_ADMISSION_BLOCKED.md) — the Segment-specific reason behind the fresh check.
- [`CI_FRESH_ADMISSION_BLOCKED`](../calculated-insight/CI_FRESH_ADMISSION_BLOCKED.md) — the calculated insight reason.
- [`IDENTITY_RESOLUTION_FRESH_ADMISSION_BLOCKED`](../identity-resolution/IDENTITY_RESOLUTION_FRESH_ADMISSION_BLOCKED.md) — the identity resolution reason.
