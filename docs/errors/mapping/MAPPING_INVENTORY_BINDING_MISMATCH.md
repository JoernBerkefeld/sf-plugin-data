# `MAPPING_INVENTORY_BINDING_MISMATCH`

> Listing the mappings of a DMO returned a mapping that targets a different DMO, so the list cannot be trusted. Rerun the retrieve; if it repeats, select mappings by name.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 retrieve`           |
| **Outcome**  | `blocked` — no file was written |

## What it means

To retrieve all mappings, the plugin lists the mappings of each DMO. One list returned a mapping whose target is not the DMO that was asked for.

## Why the plugin stops

The full mapping list is built from these per-DMO lists. An entry under the wrong DMO means the list may be incomplete or mixed up, so no mapping is saved from it.

## How to fix

1. Rerun the retrieve.
2. If it repeats, retrieve the mappings you need by name: `--metadata mapping:<Name>`.

## Example output

```text
Retrieve: blocked (MAPPING_INVENTORY_BINDING_MISMATCH).
MAPPING_INVENTORY_BINDING_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Listing the mappings of a DMO returned a mapping that targets a different DMO, so the list cannot be trusted. Rerun the retrieve; if it repeats, select mappings by name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_INVENTORY_BINDING_MISMATCH.md
```

## Related codes

- [`AMBIGUOUS_MAPPING_TARGET`](../mapping/AMBIGUOUS_MAPPING_TARGET.md) — more than one org mapping matches, so none is chosen.
- [`MAPPING_INVENTORY_UNCONFIRMED`](../mapping/MAPPING_INVENTORY_UNCONFIRMED.md) — the list of the DMO's mappings could not be confirmed.
