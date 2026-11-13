# `BLOCKED_GIT_LIFECYCLE`

> The Git changes include a rename, a conflict or a deleted file the plugin cannot identify. Stage renames so Git can detect them, or deploy the files with --source-dir or -m.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | General                          |
| **Commands** | `sf data360 deploy`              |
| **Outcome**  | `blocked` — nothing was deployed |

## What it means

With `--changed-since <ref>` the plugin collects the deployable files (DLO, DMO, mapping, relationship, data stream, data transform, data graph, identity resolution, calculated insight and Segment files) that changed between the merge base of `<ref>` and your working tree. `BLOCKED_GIT_LIFECYCLE` means at least one of those files was renamed, copied or left in a merge conflict; a deleted file in a `data360` folder belongs to no known family; one member of a calculated insight pair was deleted without the other; a plugin file was deleted in the working tree without staging the deletion; a path deleted in Git still exists locally without being tracked; or a new untracked deployable file appeared while a tracked file was deleted in the working tree (Git cannot tell whether that is a rename).

A file deleted in the range is otherwise a delete candidate identified from its merge-base content. Deploy reports candidates and never deletes them.

## Why the plugin stops

Deploy only creates and updates. Treating a renamed file as a new component would leave the old one in the org, and a deletion the plugin cannot identify cannot be reported as a delete. The plugin refuses the whole selection so nothing is deployed from a half-understood change set.

## How to fix

1. Run `git status` and `git diff --name-status <ref>` to find the renamed, deleted or conflicting files.
2. Stage deletions with `git rm`; delete or restore both calculated insight pair members together; for a deleted file of no known family, pass a `--changed-since` reference from after that deletion.
3. If a file was moved, `git add` both the old and the new path so Git records the rename, then decide whether the rename is really wanted.
4. Delete components in the org with `sf data360 delete`.
5. Deploy the remaining files explicitly with `--source-dir` or `-m type:ApiName`, or commit the cleanup and rerun with `--changed-since`.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
BLOCKED_GIT_LIFECYCLE: Git selection blocks renames, conflicts, unstaged or unidentifiable deletions of plugin files, half-deleted calculated insight pairs and a relevant untracked addition combined with any tracked worktree deletion. Stage intended changes to permit Git-inferred rename detection, then resolve unsupported lifecycle changes. Git cannot guarantee historical rename intent.
Hint: The Git changes include a rename, a conflict or a deleted file the plugin cannot identify. Stage renames so Git can detect them, or deploy the files with --source-dir or -m.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/BLOCKED_GIT_LIFECYCLE.md
```

## Related codes

- [`INVALID_GIT_SELECTION`](../general/INVALID_GIT_SELECTION.md) — the Git reference or Git output could not be used at all.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the flags or selectors do not form a valid selection.
