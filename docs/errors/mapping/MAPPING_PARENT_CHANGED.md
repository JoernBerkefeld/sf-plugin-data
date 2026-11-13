# `MAPPING_PARENT_CHANGED`

> The source DLO or target DMO changed while the mapping was being updated. Let other changes finish, inspect the mapping in the org, then rerun the deploy.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Mapping                                                              |
| **Commands** | `sf data360 deploy`                                                  |
| **Outcome**  | `blocked` before a write; `failed` with mutation `unknown` after one |

## What it means

When an update removes pairs, the plugin records the source DLOs and the target DMO before it starts, and compares them again before and after every write. They were different from the recorded state.

## Why the plugin stops

Pair removals are checked against exactly those objects. If they change in between, the plan is no longer safe and further writes could remove the wrong pairs.

## How to fix

1. Read the difference named in the message.
2. Wait until other changes to the DLO or DMO are finished.
3. Inspect the mapping, then rerun the deploy, ideally with `--preview` first.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: mapping:Customer_Home_map; mutation: unknown.
MAPPING_PARENT_CHANGED: Plugin verification failed during unmap parent preservation for Customer_Home_map: $.target.fields.length: expected 9; observed 10. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The source DLO or target DMO changed while the mapping was being updated. Let other changes finish, inspect the mapping in the org, then rerun the deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_PARENT_CHANGED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`MAPPING_UNMAP_PLAN_CHANGED`](../mapping/MAPPING_UNMAP_PLAN_CHANGED.md) — the mappings changed between planning and the first removal.
- [`MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED`](../mapping/MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED.md) — a pair removal could not be confirmed by reading back.
