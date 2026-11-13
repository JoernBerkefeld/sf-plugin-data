# `DMO_TARGET_IDENTITY_MISMATCH`

> The org returned a DMO whose name does not match the one requested. Check the exact API name in the org and rerun; inspect the target first if a write was sent.

|              |                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                                                     |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                       |
| **Outcome**  | `blocked` on the lookup before a write; `failed` with mutation `unknown` when the answer to a write names another DMO |

## What it means

The plugin reads a DMO by its full API name and expects the answer to carry that same name. The answer named another DMO. The same check runs on the answer to a create or update, and on the DMO read that confirms a field delete.

## Why the plugin stops

Every write and delete is bound to the exact DMO you selected. Acting on an answer for a different object could change or delete the wrong one, so the plugin stops.

## How to fix

1. Check the exact API name of the DMO in the org, including case and the `__dlm` suffix.
2. Make sure the file name, `identity.apiName` and the `-m dmo:<Name>__dlm` selector all use it.
3. If the item shows mutation `unknown`, read the DMO in the org before you deploy again.

## Example output

```text
Delete: blocked.
Blocked: dmo:Customer__dlm; mutation: not-attempted.
DMO_TARGET_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The org returned a DMO whose name does not match the one requested. Check the exact API name in the org and rerun; inspect the target first if a write was sent.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_TARGET_IDENTITY_MISMATCH.md
```

## Related codes

- [`INVALID_DMO_RESPONSE`](../dmo/INVALID_DMO_RESPONSE.md) — the answer could not be read at all.
- [`DLO_TARGET_IDENTITY_MISMATCH`](../dlo/DLO_TARGET_IDENTITY_MISMATCH.md) — the same check for data lake objects.
