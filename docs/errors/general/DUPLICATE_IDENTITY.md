# `DUPLICATE_IDENTITY`

> Two selected files describe the same component. Keep one file per component in the selection, for example by narrowing --source-dir, then rerun.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | General                                                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was deployed or deleted                    |

## What it means

The selection contains two different files whose content names the same component (same family, data space and API name). This happens when a project has a stray copy of a file, or when `--source-dir` points at two folders that both contain the component.

Both members of a calculated insight or Segment pair at their canonical paths count as one component and do not trigger this code.

## Why the plugin stops

With two candidate definitions the plugin cannot know which one you mean. Picking one would deploy content you may not have intended.

## How to fix

1. Search the selected folders for files with the same component name.
2. Remove or move the extra copy, or select only the folder or file you want.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (DUPLICATE_IDENTITY). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
DUPLICATE_IDENTITY: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Two selected files describe the same component. Keep one file per component in the selection, for example by narrowing --source-dir, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DUPLICATE_IDENTITY.md
```

## Related codes

- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selection is not valid in another way.
- [`DEPENDENCY_DUPLICATE_IDENTITY`](../dependency/DEPENDENCY_DUPLICATE_IDENTITY.md) — the same problem among dependencies.
