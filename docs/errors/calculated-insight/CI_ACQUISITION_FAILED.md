# `CI_ACQUISITION_FAILED`

> The calculated insight list from the target org could not be read completely. Check access to the org, then rerun the retrieve.

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Family**   | Calculated insight                                   |
| **Commands** | `sf data360 retrieve`                                |
| **Outcome**  | `blocked` — no calculated insight files were written |

## What it means

A bare `-m calculated-insight` retrieves every calculated insight the API 68 list returns in the data space, page by page. This code means a page did not have the expected shape: no item list or total, an item without a valid `__cio` API name, the same name twice, or more pages than the plugin reads.

## Why the plugin stops

Without the complete list the plugin cannot tell which calculated insights exist, so it writes none of them rather than a partial set.

## How to fix

1. Make sure the target org is authenticated and reachable: `sf org display -o <alias>`.
2. Rerun the retrieve.
3. If it keeps failing, retrieve the calculated insights you need by name with `-m calculated-insight:Name__cio`.

## Example output

```text
Retrieve: blocked.
CI_ACQUISITION_FAILED: The selection could not be retrieved completely; no files were written.
Hint: The calculated insight list from the target org could not be read completely. Check access to the org, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_ACQUISITION_FAILED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_RUNTIME_UNKNOWN`](../calculated-insight/CI_RUNTIME_UNKNOWN.md) — the read of one calculated insight failed.
