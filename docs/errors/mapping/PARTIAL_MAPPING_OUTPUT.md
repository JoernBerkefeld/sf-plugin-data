# `PARTIAL_MAPPING_OUTPUT`

> The mapping file was written, but checking it afterwards failed, so its content may be incomplete. Inspect the file, delete it if needed, and rerun the retrieve with --overwrite.

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Family**   | Mapping                                                  |
| **Commands** | `sf data360 retrieve`                                    |
| **Outcome**  | `failed` for this mapping — a file may have been written |

## What it means

The retrieve wrote `data360/mapping/<Name>.mapping-meta.json`, then read it back to confirm the content. That confirmation failed, for example because the file changed or could not be read.

## Why the plugin stops

The file on disk may not be the mapping that was read. The plugin reports it instead of claiming a successful retrieve.

## How to fix

1. Open the file and check that it is complete and valid JSON.
2. Make sure no other tool is writing to the folder.
3. Rerun the retrieve with `--overwrite`.

## Example output

```text
Retrieve: failed.
mapping:Customer_Home_map: PARTIAL_MAPPING_OUTPUT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The mapping file was written, but checking it afterwards failed, so its content may be incomplete. Inspect the file, delete it if needed, and rerun the retrieve with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/PARTIAL_MAPPING_OUTPUT.md
Downloaded mapping: 0
```

## Related codes

- [`MAPPING_DATASPACE_COLLISION`](../mapping/MAPPING_DATASPACE_COLLISION.md) — a local mapping file belongs to another data space.
