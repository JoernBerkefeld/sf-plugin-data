# `MAPPING_DELETE_SIDE_EFFECT`

> The mapping was deleted, but the DMO's other mappings or its fields changed too. Inspect the DMO and its mappings in the org; nothing was rolled back.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Mapping                                                        |
| **Commands** | `sf data360 delete`                                            |
| **Outcome**  | `failed` — the mapping is gone, but more than expected changed |

## What it means

After the deletion, the plugin reads the mapping (now absent), the other mappings of the same DMO and the DMO's field names, and compares them with what it read before. Something other than the deleted mapping was different.

## Why the plugin stops

A deletion must change only the selected mapping. A difference elsewhere may be a side effect of the deletion or a change someone else made at the same time; either way the result is not what was planned.

## How to fix

1. Read the difference named in the message.
2. Inspect the DMO and its mappings: `sf data360 retrieve --metadata dmo:<Name>__dlm --metadata mapping`.
3. Restore anything that should not have changed, for example by deploying the saved files again.

## Example output

```text
Delete: failed.
Failed: mapping:Customer_Home_map; mutation: unknown.
MAPPING_DELETE_SIDE_EFFECT: Plugin verification failed during mapping deletion readback of the other mappings and the DMO fields for Customer_Home_map: $.targetFields.length: expected 9; observed 8. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The mapping was deleted, but the DMO's other mappings or its fields changed too. Inspect the DMO and its mappings in the org; nothing was rolled back.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_DELETE_SIDE_EFFECT.md
```

## Related codes

- [`MAPPING_DELETION_UNCONFIRMED`](../mapping/MAPPING_DELETION_UNCONFIRMED.md) — the mapping was still readable after the deletion.
- [`MAPPING_DELETE_FAILED`](../mapping/MAPPING_DELETE_FAILED.md) — the destructive deployment of the mapping was not confirmed.
