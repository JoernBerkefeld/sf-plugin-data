# `UNSUPPORTED_MAPPING_DATASPACE`

> Salesforce reported the mapping in a different data space than the one this command works in. Rerun with that data space in --dataspace, or select a mapping of this data space.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Mapping                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`      |
| **Outcome**  | `blocked` before a write; `failed` with mutation `unknown` after one |

## What it means

A mapping read returned a data space name that differs from the data space of the command (`--dataspace`, or `default` when not set).

## Why the plugin stops

Saving or changing a mapping under the wrong data space would mix definitions of different data spaces.

## How to fix

1. Check which data space the mapping belongs to in Data Cloud Setup.
2. Rerun with `--dataspace <name>`, or select a mapping of the current data space.

## Example output

```text
Retrieve: failed.
mapping:Customer_Home_map: UNSUPPORTED_MAPPING_DATASPACE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: Salesforce reported the mapping in a different data space than the one this command works in. Rerun with that data space in --dataspace, or select a mapping of this data space.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/UNSUPPORTED_MAPPING_DATASPACE.md
Downloaded mapping: 0
```

## Related codes

- [`MAPPING_DATASPACE_MISMATCH`](../mapping/MAPPING_DATASPACE_MISMATCH.md) — the mapping file names another data space than the command.
- [`MAPPING_DATASPACE_COLLISION`](../mapping/MAPPING_DATASPACE_COLLISION.md) — a local mapping file belongs to another data space.
