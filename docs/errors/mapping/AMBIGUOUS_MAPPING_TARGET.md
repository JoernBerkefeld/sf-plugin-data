# `AMBIGUOUS_MAPPING_TARGET`

> More than one mapping in the org matches the same name or the same source DLO and target DMO, so the plugin cannot tell which one is meant. Inspect the DMO's mappings in the org.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Mapping                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was changed            |

## What it means

The plugin looks up mappings through the list of mappings of a DMO. Here that lookup was not unique:

- During `sf data360 deploy`, the org has more than one mapping from the file's source DLO onto its target DMO.
- During `sf data360 retrieve` of all mappings, the same mapping name was listed with different content under different DMOs.

## Why the plugin stops

Updating or saving a mapping that cannot be identified uniquely could change or overwrite the wrong one. The plugin only acts when exactly one mapping matches.

## How to fix

1. Open the target DMO in Data Cloud Setup and list its mappings.
2. Find the mappings that bind the same source DLO, or that share a name.
3. Remove the duplicate you do not need, for example with `sf data360 delete --metadata mapping:<Name>`.
4. Rerun the command.

## Example output

```text
Deploy preview: blocked (AMBIGUOUS_MAPPING_TARGET). No deployment executed.
AMBIGUOUS_MAPPING_TARGET: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: More than one mapping in the org matches the same name or the same source DLO and target DMO, so the plugin cannot tell which one is meant. Inspect the DMO's mappings in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/AMBIGUOUS_MAPPING_TARGET.md
```

## Related codes

- [`MAPPING_INVENTORY_BINDING_MISMATCH`](../mapping/MAPPING_INVENTORY_BINDING_MISMATCH.md) — a DMO's mapping list contained a mapping of another DMO.
- [`MAPPING_TARGET_BINDING_MISMATCH`](../mapping/MAPPING_TARGET_BINDING_MISMATCH.md) — the org mapping binds other objects than the file.
