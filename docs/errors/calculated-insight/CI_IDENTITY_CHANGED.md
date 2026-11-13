# `CI_IDENTITY_CHANGED`

> The calculated insight in the org has a different API name or data space than selected. Nothing was written or sent; check the selector and the pair, then rerun.

|              |                                                            |
| ------------ | ---------------------------------------------------------- |
| **Family**   | Calculated insight                                         |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was written or changed                 |

## What it means

The plugin selects a calculated insight by its exact API name in the default data space. This code means the org returned a calculated insight whose API name or data space differs from what was asked for, or the local pair names a different calculated insight than the one found in the org.

## Why the plugin stops

The plugin must never write files for, or change, a calculated insight other than the one you selected.

## How to fix

1. Check the API name in `-m calculated-insight:Name__cio` or in the pair, including upper and lower case.
2. Make sure the data space is `default`.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_IDENTITY_CHANGED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The calculated insight in the org has a different API name or data space than selected. Nothing was written or sent; check the selector and the pair, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_IDENTITY_CHANGED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_PAIR_MISMATCH`](../calculated-insight/CI_PAIR_MISMATCH.md) — the XML and JSON files name different calculated insights.
