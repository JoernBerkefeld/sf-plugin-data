# `EVIDENCE_READ_FAILED`

> The plugin could not read everything needed to export this mapping definition. Check the org session and that the mapping and its objects exist, then rerun.

|              |                                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                                                                                                             |
| **Commands** | None of the current commands. The code belongs to a mapping export routine of the plugin that `sf data360 retrieve` does not call; mapping retrieval uses the native API and reports its own codes. |
| **Outcome**  | `failed` — the mapping was not exported; the org was not changed                                                                                                                                    |

## What it means

The mapping export routine reads a mapping from several places: the mapping itself, its standard Metadata API definition, and the source DLO and target DMO through two different APIs. `EVIDENCE_READ_FAILED` means one of those reads failed with an error that has no more specific code.

## Why the plugin stops

The export is only written when all reads agree. With one read missing, the plugin cannot show that the exported file matches the org.

## How to fix

1. Check the org session with `sf org display --target-org <alias>`.
2. Make sure the mapping, its DLO and its DMO exist and are readable by your user.
3. Retrieve mappings with `sf data360 retrieve -m mapping:<ApiName>`, which uses the native route.

## Example output

```text
Retrieve: failed.
mapping:Customer_Map: EVIDENCE_READ_FAILED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The plugin could not read everything needed to export this mapping definition. Check the org session and that the mapping and its objects exist, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/EVIDENCE_READ_FAILED.md
```

## Related codes

- [`INVALID_DEFINITION`](../mapping/INVALID_DEFINITION.md) — the same export routine refused the definition it read.
- [`MAPPING_INVENTORY_UNCONFIRMED`](../mapping/MAPPING_INVENTORY_UNCONFIRMED.md) — the native mapping route could not confirm its inventory.
