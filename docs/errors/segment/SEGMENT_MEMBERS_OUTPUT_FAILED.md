# `SEGMENT_MEMBERS_OUTPUT_FAILED`

> The members were read but the output file could not be written, so no file was left. Check that the folder is writable and has free space, then rerun.

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Family**   | Segment                                              |
| **Commands** | `sf data360 segment members export`                  |
| **Outcome**  | `failed` — no file was left; the org was not changed |

## What it means

The rows are written to a temporary file beside the output file and renamed into place at the end. Creating the folder, writing the temporary file or the rename failed: the folder is not writable, the disk is full, or the output file is open in another program.

## Why the plugin stops

A file is written completely or not at all, so a failed write removes the temporary file and leaves no partial export.

## How to fix

1. Check that the folder of `--output-file` (default `data/default/`) is writable and has free space.
2. Close the output file if another program has it open.
3. Rerun the export.

## Example output

```text
Segment members export: failed.
SEGMENT_MEMBERS_OUTPUT_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The output file could not be written; no output file was left. Nothing in the org changed.
Hint: The members were read but the output file could not be written, so no file was left. Check that the folder is writable and has free space, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_MEMBERS_OUTPUT_FAILED.md
```

## Related codes

- [`SEGMENT_MEMBERS_READ_FAILED`](../segment/SEGMENT_MEMBERS_READ_FAILED.md) — a read failed instead.
