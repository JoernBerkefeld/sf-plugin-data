# `MAPPING_LAST_MAPPING_DELETE_BLOCKED`

> Salesforce does not delete the last mapping of a custom DMO. Delete the DMO instead (sf data360 delete --metadata dmo:<Name>__dlm), which removes its mapping too.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The selected mapping is the only mapping of its target DMO, and that DMO is a custom DMO. Salesforce refuses to delete the last mapping of a custom DMO. Standard DMOs do not have this limit.

## Why the plugin stops

The deletion would fail in Salesforce. The plugin checks this before sending anything, so the org stays unchanged and you get the way out directly.

## How to fix

1. If you want to remove the DMO as well, delete it: `sf data360 delete --metadata dmo:<Name>__dlm`. Its mapping is removed with it.
2. If you want to keep the DMO, create another mapping onto it first; then the original can be deleted.

## Example output

```text
Delete: blocked.
Blocked: mapping:Customer_Home_map; mutation: not-attempted.
MAPPING_LAST_MAPPING_DELETE_BLOCKED: Customer_Home_map is the only mapping of the custom DMO Customer__dlm, and Salesforce does not delete the last mapping of a custom DMO. Delete the DMO instead (sf data360 delete --metadata dmo:Customer__dlm); that removes its mapping with it. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: Salesforce does not delete the last mapping of a custom DMO. Delete the DMO instead (sf data360 delete --metadata dmo:<Name>__dlm), which removes its mapping too.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_LAST_MAPPING_DELETE_BLOCKED.md
```

## Related codes

- [`MAPPING_DELETE_FAILED`](../mapping/MAPPING_DELETE_FAILED.md) — the destructive deployment of the mapping was not confirmed.
