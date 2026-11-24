# `NOTHING_TO_DEPLOY`

> Every selected file was a verbatim file and was skipped, so there was nothing to deploy and nothing was sent. Select files the plugin can represent, or retrieve the objects again.

|              |                                                |
| ------------ | ---------------------------------------------- |
| **Family**   | General                                        |
| **Commands** | `sf data360 deploy`                            |
| **Outcome**  | `blocked` (exit code 1) — nothing was deployed |

## What it means

Retrieve writes an object the plugin cannot represent as a verbatim file: the raw response of Salesforce with a `verbatim` key instead of a definition. A verbatim file inside a selected folder is skipped with a warning so the rest of the folder still deploys. When every file the selection found is such a file, the deploy is left with nothing to send.

## Why the plugin stops

A deploy that does nothing must not look like one that deployed something. Exit code 0 would tell a script or pipeline that the selection reached the org. This code and exit code 1 say that it did not. Nothing is read from or written to the org.

A `--changed-since` range without any change is different: there is nothing to do by design, so the deploy succeeds with exit code 0.

## How to fix

1. Read the `Skipped` warnings: each names a verbatim file and the reason it was retrieved as-is.
2. Select the folders or files of the components you meant to deploy.
3. To deploy one of the skipped objects, change it in the org to a variant the plugin supports, then retrieve it again.

## Example output

```text
Deploy execution: blocked (NOTHING_TO_DEPLOY). No automatic retry or rollback performed.
Warning: Skipped data360/dmo/Example__dlm.dmo-meta.json: the dmo Example__dlm was retrieved as-is (verbatim, reason INVALID_DMO_RESPONSE) and cannot be deployed.
NOTHING_TO_DEPLOY: Deployment did not complete and nothing was written to the org. Read the item diagnostics, fix the cause, then rerun.
```

## Related codes

- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — a verbatim file selected by name is refused.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selection flags are not valid.
