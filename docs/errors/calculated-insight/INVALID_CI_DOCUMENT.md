# `INVALID_CI_DOCUMENT`

> The calculated insight JSON is not a valid document: wrong shape, name, data space or text. Retrieve the pair again instead of editing its structure.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                            |

## What it means

The `.calculatedInsight.json` document must have `schemaVersion: 1`, `kind: "calculated-insight"`, the data space `default`, an API name ending in `__cio` and nonempty text without control characters. This code means one of these is wrong, or a part of the document is not an object.

Deploy, publish and delete report a broken local file as `INVALID_SOURCE`; retrieve reports a broken org response as `CI_ACQUISITION_FAILED`.

## Why the plugin stops

The plugin only reads documents in the exact supported format, so nothing is guessed or dropped.

## How to fix

1. Retrieve the calculated insight again with `--overwrite`.
2. Edit only the SQL expression, and keep the JSON structure as retrieved.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: calculated-insight:ExampleInsight__cio.
INVALID_CI_DOCUMENT: Native CI intent, scope, content or dependencies are unqualified.
Hint: The calculated insight JSON is not a valid document: wrong shape, name, data space or text. Retrieve the pair again instead of editing its structure.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/INVALID_CI_DOCUMENT.md
```

## Related codes

- [`UNKNOWN_CI_CONFIGURATION`](../calculated-insight/UNKNOWN_CI_CONFIGURATION.md) — fields are missing or extra.
- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — how deploy, publish and delete report a broken local pair.
