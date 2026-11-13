# `MAPPING_INVENTORY_UNCONFIRMED`

> The list of the DMO's mappings could not be confirmed against the individual mapping reads. Wait for pending mapping changes to finish, then rerun.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Mapping                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`      |
| **Outcome**  | `blocked` before a write; `failed` with mutation `unknown` after one |

## What it means

Several operations need a complete, consistent picture of all mappings of a DMO. The plugin got a list it could not confirm, for example:

- the list answer had an unexpected shape or count,
- a listed mapping was not ACTIVE, or differs from its own detail read,
- two mappings share a name or a source DLO, or
- the selected mapping was missing from the list.

## Why the plugin stops

Removing pairs, deleting a mapping and removing DMO fields must leave the other mappings untouched. Without a confirmed list the plugin cannot prove that, so it stops.

## How to fix

1. Wait until no mapping of the DMO is being created or changed.
2. Rerun the command.
3. If it repeats, inspect the DMO's mappings in Data Cloud Setup for duplicates or mappings that are not active.

## Example output

```text
Deploy preview: blocked (MAPPING_INVENTORY_UNCONFIRMED). No deployment executed.
MAPPING_INVENTORY_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The list of the DMO's mappings could not be confirmed against the individual mapping reads. Wait for pending mapping changes to finish, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_INVENTORY_UNCONFIRMED.md
```

## Related codes

- [`MAPPING_TARGET_NOT_SETTLED`](../mapping/MAPPING_TARGET_NOT_SETTLED.md) — a mapping is not ACTIVE yet.
- [`MAPPING_INVENTORY_BINDING_MISMATCH`](../mapping/MAPPING_INVENTORY_BINDING_MISMATCH.md) — a DMO's mapping list contained a mapping of another DMO.
