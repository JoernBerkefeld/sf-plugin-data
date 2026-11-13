# `UNSUPPORTED_DMO_TARGET`

> The plugin does not write this DMO: it is platform-generated or namespaced, or a standard DMO selected for a whole delete. Choose a custom DMO instead.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data model object                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The plugin sorts every existing DMO by what it may do with it:

- **custom** (`creationType` `Custom`, no namespace in the name): everything, including deleting it;
- **standard** (`creationType` `Standard`): custom fields, the object label and description only; never deleted;
- **anything else** (platform-generated DMOs, a read without `creationType`, a custom DMO under a namespaced name): nothing.

This code means the DMO falls outside what the command needs: a deploy or field delete on a DMO of the third kind, a whole-DMO delete (or its preview) on anything but a custom DMO, or a deploy that would create a new DMO with a namespaced name.

## Why the plugin stops

Platform-generated and packaged DMOs belong to Salesforce features or managed packages; changing them can break those features. Standard DMOs are part of the data model and cannot be deleted. The plugin refuses before any write.

## How to fix

1. Check `creationType` and the API name of the DMO in the org.
2. To delete a standard DMO's custom fields, use `sf data360 delete -m dmo:<Name>__dlm --field <Field>__c --confirm-delete` instead of deleting the DMO.
3. To create a new DMO, use a name without a namespace prefix.
4. Leave platform-generated and namespaced DMOs out of the selection.

## Example output

```text
Delete: blocked.
Blocked: dmo:Individual__dlm; mutation: not-attempted.
UNSUPPORTED_DMO_TARGET: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The plugin does not write this DMO: it is platform-generated or namespaced, or a standard DMO selected for a whole delete. Choose a custom DMO instead.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/UNSUPPORTED_DMO_TARGET.md
```

## Related codes

- [`MAPPING_TARGET_UNSUPPORTED`](../mapping/MAPPING_TARGET_UNSUPPORTED.md) — the same kind of refusal for a mapping target.
- [`UNSUPPORTED_DMO_FIELD_CHANGE`](../dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md) — a field of a standard DMO that may not change.
