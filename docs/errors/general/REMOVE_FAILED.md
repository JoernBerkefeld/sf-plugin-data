# `REMOVE_FAILED`

> Removing this local file failed after a confirmed deletion. Close programs that hold the file, check permissions, then delete it yourself; do not repeat the delete.

|              |                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                             |
| **Commands** | `sf data360 delete` (per-file code, printed as `local file removal failed (REMOVE_FAILED): <path>`) |
| **Outcome**  | per-file — the org deletion stays confirmed; the run ends `failed` with `LOCAL_FILE_REMOVAL_FAILED` |

## What it means

`REMOVE_FAILED` is not printed as a diagnostic of its own. It is the code next to one file in the local cleanup after a confirmed deletion, in the line `local file removal failed (REMOVE_FAILED): <path>` and in the file list of `LOCAL_FILE_REMOVAL_FAILED`.

It means the plugin was allowed to remove the file but the removal itself failed without a standard operating system error code. When the operating system gives one, that code (for example `EPERM`, `EACCES` or `EBUSY`) is shown in its place.

## Why the plugin stops

The plugin removes each file with a single attempt and never retries or forces it. A failed removal is reported so you can handle it.

## How to fix

1. Do not run the delete again; the component is already gone from the org.
2. Close editors or tools that may hold the file open.
3. Check that you may delete the file, then delete it yourself.

## Example output

```text
Delete: failed.
deleted segment High_Value_Customers
local file removal failed (REMOVE_FAILED): /work/project/force-app/main/default/data360/segments/High_Value_Customers.segment.json
LOCAL_FILE_REMOVAL_FAILED: The deletion in the org is confirmed, but this local file was not removed: /work/project/force-app/main/default/data360/segments/High_Value_Customers.segment.json (REMOVE_FAILED). Do not repeat the delete; remove the file yourself.
Hint: The deletion in the org is confirmed, but a local file was not removed. Do not repeat the delete; check the file named in the message and remove it yourself.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/LOCAL_FILE_REMOVAL_FAILED.md
```

## Related codes

- [`LOCAL_FILE_REMOVAL_FAILED`](../general/LOCAL_FILE_REMOVAL_FAILED.md) — the diagnostic that lists every failed file.
- [`UNSAFE_PATH`](../general/UNSAFE_PATH.md) — the per-file code when the plugin refused to touch a file.
