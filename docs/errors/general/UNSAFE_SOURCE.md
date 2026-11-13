# `UNSAFE_SOURCE`

> A selected source file is missing, linked, too large or changed while the plugin read it. Use plain files under 1 MiB and do not edit them during the run, then rerun.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | General                                                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was deployed, deleted or published         |

## What it means

The plugin reads each selected file once, checks it, and checks it again right before acting on it. `UNSAFE_SOURCE` means one of these failed:

- the file for an `-m` selector does not exist at its canonical path;
- a file or folder in the selection is a symbolic link or junction, or a file has more than one hard link;
- a file is larger than 1 MiB, or a selected folder holds more than 256 files or is nested more than 16 levels;
- a selected folder contains a file that is not a deployable JSON or calculated insight XML file;
- the file changed between the first read and a later check.

## Why the plugin stops

The plugin must deploy exactly the bytes it checked. A linked, oversized or changing file could make the deployed content differ from what was validated.

## How to fix

1. Check that the selected files exist at their canonical paths, for example `data360/dmo/<Name__dlm>.dmo-meta.json`.
2. Replace linked files or folders with real ones.
3. Select only folders that hold deployable files, or select files directly.
4. Do not edit the files while the command runs, then rerun.

## Example output

```text
Deploy execution: blocked (UNSAFE_SOURCE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
UNSAFE_SOURCE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: A selected source file is missing, linked, too large or changed while the plugin read it. Use plain files under 1 MiB and do not edit them during the run, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/UNSAFE_SOURCE.md
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the file was read safely but its content is not valid.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selection flags are not valid.
- [`DEPLOY_FRESH_ADMISSION_BLOCKED`](../general/DEPLOY_FRESH_ADMISSION_BLOCKED.md) — a file changed between the batch check and a write.
