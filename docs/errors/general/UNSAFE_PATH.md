# `UNSAFE_PATH`

> The plugin refused a file path because it is a link, a hard-linked file, a folder or lies outside the allowed folder. Use plain files and folders inside the project, then rerun.

|              |                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                     |
| **Commands** | `sf data360 retrieve`, `sf data360 delete` (also a per-file code in delete's local cleanup) |
| **Outcome**  | `blocked` — the file was not written or removed; the org was not changed                    |

## What it means

The plugin only reads, writes and removes plain files inside plain folders. `UNSAFE_PATH` means a path did not meet that rule:

- In `sf data360 retrieve`, the output root or a folder on the way to the output file is a symbolic link, junction or file, the existing output file is linked or hard-linked or larger than 1 MiB, or `--output-dir` is a drive root or contains wildcards or `..`.
- In `sf data360 delete`, it is a per-file code printed as `local file removal failed (UNSAFE_PATH): <path>`: the file to remove after a confirmed deletion is a link, hard-linked, a folder, reached through a linked folder, or outside the project's `data360` folder or the package directory of `sfdx-project.json`. The file is left untouched and the run ends with `LOCAL_FILE_REMOVAL_FAILED`.

## Why the plugin stops

Following a link could write or delete a file somewhere else on the machine. The plugin refuses any path whose real location it cannot prove.

## How to fix

1. Replace linked folders or files in the project with real ones, or choose another `--output-dir`.
2. Do not point `--output-dir` at a drive root.
3. For a delete, check the listed file and remove it yourself if it is really obsolete; do not repeat the delete.

## Example output

```text
Retrieve: blocked.
dmo:Customer__dlm: UNSAFE_PATH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The plugin refused a file path because it is a link, a hard-linked file, a folder or lies outside the allowed folder. Use plain files and folders inside the project, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/UNSAFE_PATH.md
Downloaded dmo: 0
```

## Related codes

- [`LOCAL_FILE_REMOVAL_FAILED`](../general/LOCAL_FILE_REMOVAL_FAILED.md) — the delete diagnostic that lists files refused with this code.
- [`UNSAFE_SOURCE`](../general/UNSAFE_SOURCE.md) — the same rule for deploy input files.
- [`INVALID_PROJECT`](../general/INVALID_PROJECT.md) — the project's package directory is not usable.
