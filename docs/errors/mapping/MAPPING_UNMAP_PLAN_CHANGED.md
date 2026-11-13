# `MAPPING_UNMAP_PLAN_CHANGED`

> The DMO's mappings changed between planning and the first write, so nothing was removed. Rerun the command to plan again against the current org.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Mapping                                          |
| **Commands** | `sf data360 deploy`, `sf data360 delete --field` |
| **Outcome**  | `blocked` — nothing was removed                  |

## What it means

Right before the first pair removal, the plugin reads the mappings, the source DLOs and the target DMO again and compares them with the plan. They differ, for example because someone else changed a mapping in the meantime.

## Why the plugin stops

The plan was made for a state that no longer exists. Executing it could remove pairs that should stay.

## How to fix

1. Read the difference named in the message.
2. Rerun the command, ideally with `--preview` first.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: mapping:Customer_Home_map; mutation: not-attempted.
MAPPING_UNMAP_PLAN_CHANGED: Plugin verification failed during unmap pre-dispatch plan recheck for Customer_Home_map: $.removals.length: expected 1; observed 2. No write attempted; correct the reported check before another attempt.
Hint: The DMO's mappings changed between planning and the first write, so nothing was removed. Rerun the command to plan again against the current org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_UNMAP_PLAN_CHANGED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`MAPPING_PARENT_CHANGED`](../mapping/MAPPING_PARENT_CHANGED.md) — the DLO or DMO changed while pairs were being removed.
- [`MAPPING_INVENTORY_UNCONFIRMED`](../mapping/MAPPING_INVENTORY_UNCONFIRMED.md) — the list of the DMO's mappings could not be confirmed.
