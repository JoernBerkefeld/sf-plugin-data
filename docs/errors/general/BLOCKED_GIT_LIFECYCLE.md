# `BLOCKED_GIT_LIFECYCLE`

> The Git changes include a rename or deletion of a deployable file, which --changed-since cannot deploy. Stage renames so Git can detect them, or deploy the files with --source-dir or -m.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | General                          |
| **Commands** | `sf data360 deploy`              |
| **Outcome**  | `blocked` — nothing was deployed |

## What it means

With `--changed-since <ref>` the plugin collects the deployable files (DMO, DLO, Segment, calculated insight, identity resolution and data graph files) that changed between the merge base of `<ref>` and your working tree. `BLOCKED_GIT_LIFECYCLE` means at least one of those files was deleted, renamed, copied or left in a merge conflict, or a new untracked deployable file appeared while a tracked file was deleted in the working tree (Git cannot tell whether that is a rename).

A rename or deletion would mean renaming or deleting the component in the org, and deploy never does that.

## Why the plugin stops

Deploy only creates and updates. Treating a renamed file as a new component would leave the old one in the org, and ignoring a deletion would silently drop intent. The plugin refuses the whole selection so nothing is deployed from a half-understood change set.

## How to fix

1. Run `git status` and `git diff --name-status <ref>` to find the renamed, deleted or conflicting files.
2. If a file was moved, `git add` both the old and the new path so Git records the rename, then decide whether the rename is really wanted.
3. Delete components in the org with `sf data360 delete`, not through Git.
4. Deploy the remaining files explicitly with `--source-dir` or `-m type:ApiName`, or commit the cleanup and rerun with `--changed-since`.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
BLOCKED_GIT_LIFECYCLE: Git selection blocks DMO or Segment member renames/deletions and a relevant untracked addition combined with any tracked worktree deletion. Stage intended changes to permit Git-inferred rename detection, then resolve unsupported lifecycle changes. Git cannot guarantee historical rename intent.
Hint: The Git changes include a rename or deletion of a deployable file, which --changed-since cannot deploy. Stage renames so Git can detect them, or deploy the files with --source-dir or -m.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/BLOCKED_GIT_LIFECYCLE.md
```

## Related codes

- [`INVALID_GIT_SELECTION`](../general/INVALID_GIT_SELECTION.md) — the Git reference or Git output could not be used at all.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the flags or selectors do not form a valid selection.
