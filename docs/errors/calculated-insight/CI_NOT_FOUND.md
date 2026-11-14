# `CI_NOT_FOUND`

> The calculated insight does not exist in the target org. Check the API name and the target org, then rerun the retrieve.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Calculated insight                                            |
| **Commands** | `sf data360 retrieve`                                         |
| **Outcome**  | `blocked` — no files were written for this calculated insight |

## What it means

The API 68 read of the calculated insight answered `ITEM_NOT_FOUND`: no calculated insight with this API name exists in the target org.

## Why the plugin stops

There is nothing to export.

## How to fix

1. Check the API name in `-m calculated-insight:Name__cio`, including the `__cio` suffix and upper and lower case.
2. Check that `-o` points to the intended org.
3. Rerun the retrieve.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_NOT_FOUND: The calculated insight was not found in the target org; no files were written.
Hint: The calculated insight does not exist in the target org. Check the API name and the target org, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_NOT_FOUND.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_RUNTIME_UNKNOWN`](../calculated-insight/CI_RUNTIME_UNKNOWN.md) — the read failed without a clear not-found answer.
