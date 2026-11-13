# `DLO_TARGET_IDENTITY_MISMATCH`

> The org returned a DLO whose name or ID does not match the one requested. Check the exact API name in the org and rerun; inspect the target first if a write was sent.

|              |                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                                                                 |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                                  |
| **Outcome**  | `blocked` on the lookup before a write; `failed` with mutation `unknown` when the answer to a create or update names another DLO |

## What it means

The plugin reads a DLO by its full API name and expects the answer to carry that same name and an 18-character record ID. The answer named another DLO, or had no usable ID.

The same check runs on the answer to a create or update: the DLO Salesforce returns must be the one the file describes.

## Why the plugin stops

Every write and delete is bound to the exact DLO you selected. Acting on an answer that names a different object could change or delete the wrong one. The plugin stops instead.

## How to fix

1. Check the exact API name of the DLO in the org, including case and the `__dll` suffix.
2. Make sure the file name, `identity.apiName` and the `-m dlo:<Name>__dll` selector all use it.
3. If the item shows mutation `unknown`, read the DLO in the org before you deploy again.
4. Rerun the command.

## Example output

```text
Delete: blocked.
Blocked: dlo:Orders__dll; mutation: not-attempted.
DLO_TARGET_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The org returned a DLO whose name or ID does not match the one requested. Check the exact API name in the org and rerun; inspect the target first if a write was sent.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_TARGET_IDENTITY_MISMATCH.md
```

## Related codes

- [`AMBIGUOUS_DLO_RESPONSE`](../dlo/AMBIGUOUS_DLO_RESPONSE.md) — the answer held no or several DLOs.
- [`INVALID_DLO_TARGET_ID`](../dlo/INVALID_DLO_TARGET_ID.md) — the record ID was rejected just before a write.
- [`DMO_TARGET_IDENTITY_MISMATCH`](../dmo/DMO_TARGET_IDENTITY_MISMATCH.md) — the same check for data model objects.
