# `CI_PAIR_MISMATCH`

> The XML and JSON files of the calculated insight pair do not match in name, label, SQL or type. Retrieve the pair again so both files agree.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Calculated insight                                            |
| **Commands** | `sf data360 retrieve`                                         |
| **Outcome**  | `blocked` — no files were written for this calculated insight |

## What it means

A calculated insight is stored as two files: the standard `.mktCalcInsightObjectDef-meta.xml` and the `.calculatedInsight.json` companion. The file name, `masterLabel`, `expression` and `creationType` in the XML must equal the name, `displayName`, `expression` and `creationType` in the JSON. This code means the standard XML read from the org does not match the checked JSON.

Deploy, publish and delete check the same for local files and report a mismatch as `INVALID_SOURCE`.

## Why the plugin stops

Both files describe the same calculated insight. If they disagree, either file could be wrong, so the plugin writes neither.

## How to fix

1. Wait a moment if the calculated insight was just changed, then rerun the retrieve.
2. For local files, do not edit one file alone: change the SQL in both, or retrieve the pair again with `--overwrite`.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_PAIR_MISMATCH: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The XML and JSON files of the calculated insight pair do not match in name, label, SQL or type. Retrieve the pair again so both files agree.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_PAIR_MISMATCH.md
Downloaded calculated-insight: 0
```

## Related codes

- [`INVALID_CI_XML`](../calculated-insight/INVALID_CI_XML.md) — the XML file itself is not valid.
- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — how deploy, publish and delete report a broken local pair.
