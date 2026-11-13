# `CI_INVENTORY_UNQUALIFIED`

> Retrieving all calculated insights at once is not supported. Select each one with -m calculated-insight:Name__cio.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Calculated insight                      |
| **Commands** | `sf data360 retrieve`                   |
| **Outcome**  | `blocked` — nothing was read or written |

## What it means

The selector `-m calculated-insight` without a name asks for every calculated insight in the org. The plugin retrieves calculated insights only one by one, by exact API name.

## Why the plugin stops

Most calculated insights in an org use SQL that the artifact cannot hold. A list retrieve would mostly fail, so the plugin asks for an explicit selection.

## How to fix

Repeat `-m calculated-insight:Name__cio` for each calculated insight, for example:

```sh
sf data360 retrieve -o source -m calculated-insight:ExampleInsight__cio -d ./project
```

## Example output

```text
Retrieve: blocked (CI_INVENTORY_UNQUALIFIED).
CI_INVENTORY_UNQUALIFIED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieving all calculated insights at once is not supported. Select each one with -m calculated-insight:Name__cio.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_INVENTORY_UNQUALIFIED.md
```

## Related codes

- [`CI_NOT_FOUND`](../calculated-insight/CI_NOT_FOUND.md) — an exact selector names a calculated insight that does not exist.
