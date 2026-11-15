# `CI_ADMISSION_FAILED`

> The calculated insight file or its read from the org did not pass, so nothing was sent. Run the command with --preview, fix the file, data space or target access, then rerun.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Calculated insight                                             |
| **Commands** | `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                |

## What it means

Before deploy, publish or delete sends anything, the plugin checks the local JSON and SQL files and reads the calculated insight in the org by name with the API 68 GET. This code means that step failed for a reason without its own code. Typical reasons:

- the `dataSpace` in the JSON is not the selected data space;
- the org read failed with an error that is not a clear not-found;
- the files changed on disk while the command was running.

If Salesforce returned an error, the message carries the Salesforce detail. Whether the SQL, label or schedule are valid is not checked here: Salesforce decides when the write is sent.

## Why the plugin stops

Each write is sent at most once and is not rolled back, so it is sent only to the insight that was just read and from the files that were just checked.

## How to fix

1. Run the same command with `--preview` to see the planned outcome.
2. Check the `dataSpace` in the JSON and the `--dataspace` flag.
3. Check access to the target org, then rerun the command.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: calculated-insight:ExampleInsight__cio.
CI_ADMISSION_FAILED: The calculated insight could not be read or its file or data space is invalid; nothing was sent.
Hint: The calculated insight file or its read from the org did not pass, so nothing was sent. Run the command with --preview, fix the file, data space or target access, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_ADMISSION_FAILED.md
```

## Related codes

- [`CI_MUTATION_UNCONFIRMED`](../calculated-insight/CI_MUTATION_UNCONFIRMED.md) — the deploy was sent, but its result could not be confirmed.
- [`CI_PUBLICATION_UNCONFIRMED`](../calculated-insight/CI_PUBLICATION_UNCONFIRMED.md) — the publish was sent, but its result could not be confirmed.
- [`CI_DELETION_UNCONFIRMED`](../calculated-insight/CI_DELETION_UNCONFIRMED.md) — the delete was sent, but its result could not be confirmed.
