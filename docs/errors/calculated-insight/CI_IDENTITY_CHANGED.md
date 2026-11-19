# `CI_IDENTITY_CHANGED`

> The calculated insight in the org has a different API name or data space than selected. Nothing was written or sent; check the selector and the JSON file, then rerun.

|              |                                                            |
| ------------ | ---------------------------------------------------------- |
| **Family**   | Calculated insight                                         |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was written or changed                 |

## What it means

The plugin selects a calculated insight by its exact API name in the run's data space (`--dataspace`, or `default` when you leave it out). This code means the org returned a calculated insight whose API name or data space differs from what was asked for, or the local JSON file names a different calculated insight than the one found in the org.

## Why the plugin stops

The plugin must never write files for, or change, a calculated insight other than the one you selected.

## How to fix

1. Check the API name in `-m calculated-insight:Name__cio` or in the `apiName` of the JSON file, including upper and lower case.
2. Run with the `--dataspace` the insight belongs to; `c__dataSpace` in the JSON names it.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_IDENTITY_CHANGED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The calculated insight in the org has a different API name or data space than selected. Nothing was written or sent; check the selector and the JSON file, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_IDENTITY_CHANGED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_NOT_FOUND`](../calculated-insight/CI_NOT_FOUND.md) — no calculated insight with that name exists in the org.
