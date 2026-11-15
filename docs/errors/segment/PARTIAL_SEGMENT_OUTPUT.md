# `PARTIAL_SEGMENT_OUTPUT`

> A segment file was written, but a later step of saving the JSON and SQL files failed, so the files on disk may not be complete. Inspect the .segment.json and .sql files and retrieve again with --overwrite.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Segment                                                              |
| **Commands** | `sf data360 retrieve`                                                |
| **Outcome**  | `failed` — the local file may be incomplete; the org was not changed |

## What it means

The plugin writes `data360/segments/<Name>.segment.json` and one `<Name>.segment.<model>.sql` per model through staged files, and removes the SQL file of a model the segment no longer has. A file had already been placed or removed when a later step failed, for example the final read-back of the files or the cleanup of a staged copy.

## Why the plugin stops

Once a file has been placed, the plugin cannot claim that nothing was written. It reports the partial state instead of a clean failure so you check the file.

## How to fix

1. Open `data360/segments/<Name>.segment.json` and its `.sql` files and check that they are complete.
2. Make sure no other process is writing to the project folder.
3. Retrieve the segment again with `--overwrite`.

## Example output

```text
Retrieve: failed.
segment:Example_Segment: PARTIAL_SEGMENT_OUTPUT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: A segment file was written, but a later step of saving the JSON and SQL files failed, so the files on disk may not be complete. Inspect the .segment.json and .sql files and retrieve again with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/PARTIAL_SEGMENT_OUTPUT.md
Downloaded segment: 0
```

## Related codes

- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — Saving failed before any file was placed.
- [`OUTPUT_CHANGED`](../general/OUTPUT_CHANGED.md) — The file changed while the plugin was writing it.
