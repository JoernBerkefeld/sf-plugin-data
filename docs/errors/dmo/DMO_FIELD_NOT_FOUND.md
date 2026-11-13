# `DMO_FIELD_NOT_FOUND`

> A field named for removal does not exist on the DMO in the org. Check the exact field API names, then rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data model object                        |
| **Commands** | `sf data360 delete`, `sf data360 deploy` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

On `sf data360 delete --field`, at least one field you named is not on the DMO in the target org. The message lists the missing names.

The same check runs again just before the removal is sent (on delete, and on a deploy with `--allow-field-removal`): if a planned field has disappeared in the meantime, the removal stops here.

## Why the plugin stops

The removal is sent as one Metadata API change for all named fields. A name that does not exist would make that change fail or point at something else, so the plugin checks first and sends nothing.

## How to fix

1. Read the DMO in the org and list its fields.
2. Use the exact API names, including the `__c` suffix and the case.
3. If someone else removed the field meanwhile, drop it from the command and rerun.

## Example output

```text
Delete: blocked.
Blocked: dmo:Customer__dlm field Nickname__c; mutation: not-attempted.
DMO_FIELD_NOT_FOUND: Field delete refused for Customer__dlm: Nickname__c does not exist on the target. No write attempted; correct the reported check before another attempt.
Hint: A field named for removal does not exist on the DMO in the org. Check the exact field API names, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_FIELD_NOT_FOUND.md
```

## Related codes

- [`UNSUPPORTED_DMO_FIELD_CHANGE`](../dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md) — the field exists but may not be removed.
- [`INVALID_DMO_FIELD`](../dmo/INVALID_DMO_FIELD.md) — the field name itself is malformed.
