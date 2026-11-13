# `OUTPUT_CHANGED`

> The target file changed on disk while the plugin was writing it, so the write stopped. Make sure nothing else edits the project during the run, then rerun.

|              |                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                        |
| **Commands** | `sf data360 retrieve`, `sf data360 delete --field`                                             |
| **Outcome**  | `blocked` or `failed` — the file was not replaced, or its final content could not be confirmed |

## What it means

The plugin writes each file in steps: it reads the current file, prepares the new content in a private temporary folder, checks the current file again, then puts the new file in place and reads it back. `OUTPUT_CHANGED` means one of the checks saw a different file than before: another program changed, replaced or created the file in the meantime, or the final read-back did not match.

## Why the plugin stops

Overwriting a file that someone else just changed would silently lose their edit. The plugin stops instead and leaves the file as it found it whenever it can.

## How to fix

1. Close editors, sync tools or watchers that may be writing the same files.
2. Check the file named in the result and decide which content you want to keep.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:Lifetime_Value__cio: OUTPUT_CHANGED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The target file changed on disk while the plugin was writing it, so the write stopped. Make sure nothing else edits the project during the run, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/OUTPUT_CHANGED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — the file differs and `--overwrite` was not given.
- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — writing the file failed for another reason.
- [`PARTIAL_DATA_GRAPH_OUTPUT`](../data-graph/PARTIAL_DATA_GRAPH_OUTPUT.md) — a file was placed but could not be confirmed.
