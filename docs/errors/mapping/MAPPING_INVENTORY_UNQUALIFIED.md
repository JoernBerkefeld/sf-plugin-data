# `MAPPING_INVENTORY_UNQUALIFIED`

> Retrieving all mappings is not supported together with the other selected families. Select mappings by name (mapping:<Name>) or retrieve mapping in its own run.

|              |                                   |
| ------------ | --------------------------------- |
| **Family**   | Mapping                           |
| **Commands** | `sf data360 retrieve`             |
| **Outcome**  | `blocked` — nothing was retrieved |

## What it means

You selected the bare `mapping` type, meaning all mappings, together with a family such as `segment`, `identity-resolution` or `calculated-insight`. Listing all mappings is only available when the selection contains just `dlo`, `dmo`, `mapping` and `relationship:<Name>` selectors.

## Why the plugin stops

In a mixed selection the plugin has no confirmed way to list every mapping, so it refuses rather than return a partial set.

## How to fix

1. Name the mappings you need: `--metadata mapping:<Name>`, or
2. Retrieve all mappings in a separate run: `sf data360 retrieve --metadata mapping`.

## Example output

```text
Retrieve: blocked (MAPPING_INVENTORY_UNQUALIFIED).
MAPPING_INVENTORY_UNQUALIFIED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieving all mappings is not supported together with the other selected families. Select mappings by name (mapping:<Name>) or retrieve mapping in its own run.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_INVENTORY_UNQUALIFIED.md
```

## Related codes

- [`INVALID_MAPPING_NAME`](../mapping/INVALID_MAPPING_NAME.md) — the mapping name itself is malformed.
