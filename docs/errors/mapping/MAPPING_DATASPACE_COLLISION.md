# `MAPPING_DATASPACE_COLLISION`

> A local mapping file with this name already belongs to another data space, so it was not overwritten. Retrieve into another --output-dir or move the existing file.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Mapping                                                       |
| **Commands** | `sf data360 retrieve`                                         |
| **Outcome**  | `failed` for this mapping — the local file was left unchanged |

## What it means

The retrieve wanted to save the mapping to `data360/mapping/<Name>.mapping-meta.json`, but a file with that name already exists and its `identity.dataSpace` names a different data space.

## Why the plugin stops

Two mappings from different data spaces can share a name. Overwriting the file would silently replace one with the other, so the plugin refuses, even with `--overwrite`.

## How to fix

1. Decide which data space the project folder is for.
2. Move or rename the existing file, or rerun with a separate `--output-dir` for the other data space.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
mapping:Customer_Home_map: MAPPING_DATASPACE_COLLISION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: A local mapping file with this name already belongs to another data space, so it was not overwritten. Retrieve into another --output-dir or move the existing file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_DATASPACE_COLLISION.md
Downloaded mapping: 0
```

## Related codes

- [`MAPPING_DATASPACE_MISMATCH`](../mapping/MAPPING_DATASPACE_MISMATCH.md) — the mapping file names another data space than the command.
- [`PARTIAL_MAPPING_OUTPUT`](../mapping/PARTIAL_MAPPING_OUTPUT.md) — a mapping file was written but could not be confirmed.
