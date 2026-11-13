# `LOCAL_FILE_REMOVAL_FAILED`

> The deletion in the org is confirmed, but a local file was not removed. Do not repeat the delete; check the file named in the message and remove it yourself.

|              |                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                     |
| **Commands** | `sf data360 delete`                                                                         |
| **Outcome**  | `failed` (exit code 1) — the org deletion stays confirmed; only local cleanup is incomplete |

## What it means

After a confirmed deletion, `sf data360 delete` removes the component's own local file (unless `--keep-local-files` is set). One or more of those files could not be removed. The message lists each file with a per-file code:

- `UNSAFE_PATH` — the file is a link, a hard-linked file, a folder, reached through a linked folder, or outside the allowed area, so the plugin left it alone.
- `REMOVE_FAILED` or an operating system code such as `EPERM`, `EACCES` or `EBUSY` — the removal itself failed.

Each failed file is also printed as `local file removal failed (CODE): path`.

## Why the plugin stops

The plugin removes only plain, single files it can prove belong to the deleted component, one at a time and never recursively. When that proof or the removal fails, it reports instead of trying harder. The command exits nonzero so scripts notice the leftover file.

## How to fix

1. Do not run the delete again; the component is already gone from the org.
2. Look at each listed file. For `UNSAFE_PATH`, check whether it is a link or lies outside the project's `data360` folder and decide yourself whether to delete it.
3. For `REMOVE_FAILED` or an OS code, close programs that hold the file open, check permissions, then delete it.

## Example output

```text
Delete: failed.
deleted dmo Customer__dlm
local file removal failed (EPERM): /work/project/data360/dmo/Customer__dlm.dmo-meta.json
LOCAL_FILE_REMOVAL_FAILED: The deletion in the org is confirmed, but this local file was not removed: /work/project/data360/dmo/Customer__dlm.dmo-meta.json (EPERM). Do not repeat the delete; remove the file yourself.
Hint: The deletion in the org is confirmed, but a local file was not removed. Do not repeat the delete; check the file named in the message and remove it yourself.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/LOCAL_FILE_REMOVAL_FAILED.md
```

## Related codes

- [`REMOVE_FAILED`](../general/REMOVE_FAILED.md) — per-file code when the removal itself failed.
- [`UNSAFE_PATH`](../general/UNSAFE_PATH.md) — per-file code when the plugin refused to touch the file.
- [`LOCAL_REFRESH_FAILED`](../general/LOCAL_REFRESH_FAILED.md) — the same situation for files a field-level delete should refresh.
