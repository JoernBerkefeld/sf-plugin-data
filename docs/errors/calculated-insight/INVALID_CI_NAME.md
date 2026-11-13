# `INVALID_CI_NAME`

> The calculated insight API name is not valid. Use the full API name that starts with a letter and ends in __cio, for example ExampleInsight__cio.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was sent                                                          |

## What it means

Calculated insight requests are sent only for an exact API name: a letter, then letters, digits or underscores, ending in `__cio`, at most 200 characters. This code means a name did not have that form. Commands check selectors earlier, so this is a last guard before a request is built.

## Why the plugin stops

The name becomes part of the request URL. The plugin never sends a partial name, an ID or a search query instead.

## How to fix

1. Use the full API name, for example `-m calculated-insight:ExampleInsight__cio`.
2. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: INVALID_CI_NAME: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The calculated insight API name is not valid. Use the full API name that starts with a letter and ends in __cio, for example ExampleInsight__cio.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/INVALID_CI_NAME.md
Downloaded calculated-insight: 0
```

## Related codes

- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selector itself is malformed.
