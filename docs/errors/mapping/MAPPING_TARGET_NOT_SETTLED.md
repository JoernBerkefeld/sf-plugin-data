# `MAPPING_TARGET_NOT_SETTLED`

> The mapping in the org is not ACTIVE yet, for example because Salesforce is still processing an earlier change. Wait until it is ACTIVE, then rerun.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Mapping                                                              |
| **Commands** | `sf data360 deploy`, `sf data360 delete --field`                     |
| **Outcome**  | `blocked` before a write; `failed` with mutation `unknown` after one |

## What it means

The plugin only changes a mapping whose status is ACTIVE. The mapping, or another mapping of the same DMO, reported a different status, such as CREATING, before the next write.

## Why the plugin stops

Changing a mapping while Salesforce is still processing it can lead to lost or doubled pairs. The plugin waits for a settled state and otherwise stops.

## How to fix

1. Wait a few minutes.
2. Check the mapping status in Data Cloud Setup.
3. Rerun the command once it is ACTIVE.

## Example output

```text
Deploy preview: blocked (MAPPING_TARGET_NOT_SETTLED). No deployment executed.
MAPPING_TARGET_NOT_SETTLED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The mapping in the org is not ACTIVE yet, for example because Salesforce is still processing an earlier change. Wait until it is ACTIVE, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_TARGET_NOT_SETTLED.md
```

## Related codes

- [`MAPPING_INVENTORY_UNCONFIRMED`](../mapping/MAPPING_INVENTORY_UNCONFIRMED.md) — the list of the DMO's mappings could not be confirmed.
- [`MAPPING_PERSISTENCE_UNCONFIRMED`](../mapping/MAPPING_PERSISTENCE_UNCONFIRMED.md) — a mapping write could not be confirmed by reading it back.
