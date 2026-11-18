# `UNSUPPORTED_DMO_TARGET`

> The plugin does not send this DMO write: a whole delete of a standard DMO or of a DMO read without a creationType, or a new DMO with a namespaced name.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data model object                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The plugin sorts every existing DMO by what it writes on it:

- **custom** (`creationType` `Custom`, no namespace in the name): every field and property;
- **everything else** (standard DMOs, the DMOs Salesforce generates for identity resolution, data graphs or segments, a custom DMO under a namespaced name, a read without `creationType`): custom fields, the object label and the object description only.

A whole-DMO delete is sent for every DMO except a standard one (`creationType` `Standard`) and a read without `creationType`. This code means the command asked for one of those deletes (or its preview), or a deploy would create a new DMO with a namespaced name.

## Why the plugin stops

Standard DMOs are part of the Salesforce data model; the plugin never deletes them. Salesforce does not allow a new DMO name with a namespace. The plugin refuses before any write.

## How to fix

1. Check `creationType` and the API name of the DMO in the org.
2. To delete fields of a standard DMO, use `sf data360 delete -m dmo:<Name>__dlm --field <Field>__c` instead of deleting the DMO.
3. To create a new DMO, use a name without a namespace prefix.

## Example output

```text
Delete: blocked.
Blocked: dmo:ssot__Individual__dlm; mutation: not-attempted.
UNSUPPORTED_DMO_TARGET: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The plugin does not send this DMO write: a whole delete of a standard DMO or of a DMO read without a creationType, or a new DMO with a namespaced name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/UNSUPPORTED_DMO_TARGET.md
```

## Related codes

- [`UNSUPPORTED_DMO_FIELD_CHANGE`](../dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md) — a field change a deploy does not send.
