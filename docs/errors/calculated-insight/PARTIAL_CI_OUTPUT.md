# `PARTIAL_CI_OUTPUT`

> Only part of the calculated insight pair was written to disk. Check both files, then rerun the retrieve with --overwrite to write a matching pair.

|              |                                                 |
| ------------ | ----------------------------------------------- |
| **Family**   | Calculated insight                              |
| **Commands** | `sf data360 retrieve`                           |
| **Outcome**  | `blocked` — one pair file may have been written |

## What it means

Retrieve writes the XML file and the JSON file one after the other. This code means at least one file was already in place when a later step failed, for example a file changed on disk at the same time or the final check of both files failed.

## Why the plugin stops

The two files may now be out of step. The plugin stops and reports it rather than guessing which file is correct.

## How to fix

1. Check the `.mktCalcInsightObjectDef-meta.xml` and `.calculatedInsight.json` files of the calculated insight.
2. Make sure no other process writes to the output folder.
3. Rerun the retrieve with `--overwrite`.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: PARTIAL_CI_OUTPUT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: Only part of the calculated insight pair was written to disk. Check both files, then rerun the retrieve with --overwrite to write a matching pair.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/PARTIAL_CI_OUTPUT.md
Downloaded calculated-insight: 0
```

## Related codes

- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — existing files differ and `--overwrite` is missing.
- [`CI_PAIR_MISMATCH`](../calculated-insight/CI_PAIR_MISMATCH.md) — the pair files disagree.
