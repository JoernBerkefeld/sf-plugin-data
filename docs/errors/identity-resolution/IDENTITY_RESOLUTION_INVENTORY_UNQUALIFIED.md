# `IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED`

> Retrieving all identity resolution rulesets at once is not supported. Name each ruleset with --metadata identity-resolution:<Name>.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Identity resolution                     |
| **Commands** | `sf data360 retrieve`                   |
| **Outcome**  | `blocked` — nothing was read or written |

## What it means

You selected the bare type `identity-resolution` without a name. The retrieve only supports named rulesets.

## Why the plugin stops

The plugin retrieves exactly what you name. It does not list and export every ruleset in the org.

## How to fix

Name each ruleset:

```text
sf data360 retrieve --metadata identity-resolution:Individual_Main
```

Repeat `--metadata` for more rulesets.

## Example output

```text
Retrieve: blocked (IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED).
IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieving all identity resolution rulesets at once is not supported. Name each ruleset with --metadata identity-resolution:<Name>.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED.md
```

## Related codes

- [`DATA_GRAPH_INVENTORY_UNQUALIFIED`](../data-graph/DATA_GRAPH_INVENTORY_UNQUALIFIED.md) — the same rule for data graphs.
