# `OUTPUT_FAILED`

> The retrieved definition could not be written to the project. Check that the output folder is writable, has free space and that the temp folder settings are valid, then rerun.

|              |                                                                           |
| ------------ | ------------------------------------------------------------------------- |
| **Family**   | General                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 delete --field`                        |
| **Outcome**  | `failed` — no file was written for the component; the org was not changed |

## What it means

Writing a file failed for a reason without a more specific code: the folder could not be created, the disk is full or read-only, permissions are missing, the private temporary folder could not be used, or the content could not be validated before writing.

`sf data360 delete --field` reports the same code per file when refreshing a DMO or mapping file fails.

## Why the plugin stops

A file is written completely or not at all. When a step fails, the plugin stops for that component rather than leaving a half-written file.

## How to fix

1. Check that the project folder (`--output-dir`) exists, is writable and has free space.
2. Check that `TEMP` and `TMP` point to an existing, writable folder.
3. Rerun the command.

## Example output

```text
Retrieve: failed.
data-graph:Customer_Graph: OUTPUT_FAILED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The retrieved definition could not be written to the project. Check that the output folder is writable, has free space and that the temp folder settings are valid, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/OUTPUT_FAILED.md
Downloaded data-graph: 0
```

## Related codes

- [`UNSAFE_PATH`](../general/UNSAFE_PATH.md) — the output path is not safe to write to.
- [`UNSAFE_TEMP`](../general/UNSAFE_TEMP.md) — the temp folder settings were refused.
- [`OUTPUT_CHANGED`](../general/OUTPUT_CHANGED.md) — the file changed during the write.
- [`LOCAL_REFRESH_FAILED`](../general/LOCAL_REFRESH_FAILED.md) — the field-level delete summary for failed refreshes.
