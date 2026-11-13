# `INVALID_SELECTION`

> The selection is not valid for this command. Check the -m type:ApiName syntax, the --source-dir paths and flags that cannot be combined, then rerun.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | General                                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was read, written or deleted                                      |

## What it means

The plugin could not turn the flags into a selection it supports. Common causes:

- a `-m` value that is not an exact `type:ApiName` the command accepts, or a name that does not fit the family's naming rules;
- both `--source-dir` and `-m`, or neither, where one is required;
- a `--source-dir` value with wildcards, `..` or a drive-relative path;
- a selector whose file is at a different path or names a different component than expected;
- `--changed-since` combined with `--source-dir` or `-m`, or a selection that finds no files;
- options that belong to another family, such as `--transform-target-id` without a data transform.

## Why the plugin stops

Every command works on an explicit, exact selection. When the selection is unclear the plugin stops before talking to the org, so nothing unintended is read, written or deleted.

## How to fix

1. Check each `-m` value against the command help (`sf data360 <command> --help`).
2. Use either `--source-dir` or `-m` (or `--changed-since` for deploy), as the command requires.
3. Use plain relative or absolute paths without wildcards or `..`.
4. Remove options that do not belong to the selected family.

## Example output

```text
Deploy execution: blocked (INVALID_SELECTION). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The selection is not valid for this command. Check the -m type:ApiName syntax, the --source-dir paths and flags that cannot be combined, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_SELECTION.md
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the selected file was found but its content is not valid.
- [`UNSAFE_SOURCE`](../general/UNSAFE_SOURCE.md) — the selected file is missing, linked or changed.
- [`INVALID_SCOPE`](../general/INVALID_SCOPE.md) — the API version or data space is not supported.
- [`INVALID_GIT_SELECTION`](../general/INVALID_GIT_SELECTION.md) — the `--changed-since` selection failed.
