# `PARTIAL_CI_OUTPUT`

> Only one of the two calculated insight files was written to disk. Check the JSON and SQL files, then rerun the retrieve with --overwrite.

|              |                                                        |
| ------------ | ------------------------------------------------------ |
| **Family**   | Calculated insight                                     |
| **Commands** | `sf data360 retrieve`                                  |
| **Outcome**  | `blocked` — one of the two files may have been written |

## What it means

Retrieve writes a calculated insight as two files in `data360/calculatedInsights/`: `<Name>__cio.calculatedInsight-meta.json` and its SQL in `<Name>__cio.calculatedInsight-meta.sql`. Two files cannot be replaced in one step, so they are written one after the other. This code means at least one file was already in place when a later step failed, for example a file changed on disk at the same time or the final check of both files failed.

## Why the plugin stops

The JSON and the SQL may now come from different reads. The plugin stops and reports it rather than guessing which file is correct.

## How to fix

1. Check the `.calculatedInsight-meta.json` and `.calculatedInsight-meta.sql` files of the calculated insight.
2. Make sure no other process writes to the output folder.
3. Rerun the retrieve with `--overwrite`.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: PARTIAL_CI_OUTPUT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: Only one of the two calculated insight files was written to disk. Check the JSON and SQL files, then rerun the retrieve with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/PARTIAL_CI_OUTPUT.md
Downloaded calculated-insight: 0
```

## Related codes

- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — existing files differ and `--overwrite` is missing.
