# `INVALID_CI_XML`

> The calculated insight XML is malformed or has elements the plugin does not support. Retrieve the pair again; only creationType, expression and masterLabel are allowed.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Calculated insight                                            |
| **Commands** | `sf data360 retrieve`                                         |
| **Outcome**  | `blocked` — no files were written for this calculated insight |

## What it means

The standard `.mktCalcInsightObjectDef-meta.xml` file must have the root `MktCalcInsightObjectDef` in the Metadata namespace and contain each of `creationType`, `expression` and `masterLabel` exactly once, and nothing else. It must not contain DOCTYPE or comments, carriage returns, invalid characters or unknown entities. This code means the XML read from the org does not follow these rules.

Deploy, publish and delete check local XML the same way and report a broken file as `INVALID_SOURCE`.

## Why the plugin stops

The plugin does not run a general XML parser. It accepts only the exact supported form, so no content is lost or misread.

## How to fix

1. Rerun the retrieve with `--overwrite` to write a fresh pair.
2. For local files, keep LF line endings and do not add elements or comments.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: INVALID_CI_XML: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The calculated insight XML is malformed or has elements the plugin does not support. Retrieve the pair again; only creationType, expression and masterLabel are allowed.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/INVALID_CI_XML.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_PAIR_MISMATCH`](../calculated-insight/CI_PAIR_MISMATCH.md) — the XML is valid but does not match the JSON.
- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — how deploy, publish and delete report a broken local pair.
