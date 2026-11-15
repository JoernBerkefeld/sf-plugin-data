# `INVALID_CI_DOCUMENT`

> The calculated insight document lacks its API name, data space or SQL, or is not a JSON object. Retrieve the calculated insight again.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                            |

## What it means

The plugin checks only the structure of a calculated insight: a JSON object with an `apiName` ending in `__cio`, a nonempty `dataSpace` and a nonempty `expression` (the SQL). Every other key is kept as Salesforce returned it. This code means the API 68 read of the calculated insight from the org did not have this structure.

Deploy, publish and delete report a broken local `.calculatedInsight-meta.json` or `.calculatedInsight-meta.sql` file as `INVALID_SOURCE`.

## Why the plugin stops

Without the name, data space and SQL the plugin cannot write the two files or compare the org with them.

## How to fix

1. Rerun the command; if the org answer stays the same, check the calculated insight in Data 360.
2. For a local file, retrieve the calculated insight again with `--overwrite` instead of editing its structure.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: INVALID_CI_DOCUMENT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The calculated insight document lacks its API name, data space or SQL, or is not a JSON object. Retrieve the calculated insight again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/INVALID_CI_DOCUMENT.md
Downloaded calculated-insight: 0
```

## Related codes

- [`INVALID_CI_NAME`](../calculated-insight/INVALID_CI_NAME.md) — the API name does not end in `__cio`.
- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — how deploy, publish and delete report a broken local file.
