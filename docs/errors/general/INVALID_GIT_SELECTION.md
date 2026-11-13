# `INVALID_GIT_SELECTION`

> The --changed-since reference or the Git output could not be used. Pass a commit, branch or tag that exists locally and run the command inside the Git repository.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | General                          |
| **Commands** | `sf data360 deploy`              |
| **Outcome**  | `blocked` — nothing was deployed |

## What it means

With `--changed-since <ref>` the plugin asks Git for the files that changed since the merge base of `<ref>` and `HEAD`. `INVALID_GIT_SELECTION` means that step failed: the reference is empty, starts with `-` or does not resolve to a commit, there is no common merge base, the current folder is not inside a Git repository, Git returned output the plugin could not read, or a changed file (or a deleted file's merge-base content) could not be read as a valid deploy input.

## Why the plugin stops

Deploying from a change list the plugin could not read completely might skip or add components. It refuses the whole selection instead.

## How to fix

1. Check the reference: `git rev-parse --verify <ref>^{commit}`. Run `git fetch` if it is a remote branch you have not fetched.
2. Run the deploy from inside the repository.
3. Make sure changed deployable files are valid and sit at their canonical paths (see the Git workflow page), and that a deleted file was valid at the merge base.
4. Alternatively, deploy the files explicitly with `--source-dir` or `-m`.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_GIT_SELECTION: Git selection failed. Use a valid commit reference and canonical files under data360/ (DLO, DMO, mapping, relationship, data stream, data transform) or the configured package directory (data graph, identity resolution, calculated insight, Segment JSON) with matching identities and unchanged admitted bytes.
Hint: The --changed-since reference or the Git output could not be used. Pass a commit, branch or tag that exists locally and run the command inside the Git repository.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_GIT_SELECTION.md
```

## Related codes

- [`BLOCKED_GIT_LIFECYCLE`](../general/BLOCKED_GIT_LIFECYCLE.md) — the Git changes include a rename, a conflict or an unidentifiable deletion.
- [`DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED`](../data-stream/DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED.md) — data streams must be deployed on their own, also through Git.
