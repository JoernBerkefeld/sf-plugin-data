# `UNSUPPORTED_DMO_TARGET`

> The plugin does not send this DMO write: a new DMO with a namespaced name, or a write to a DMO whose read has no name.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data model object                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The plugin sorts every existing DMO by what it writes on it:

- **custom** (`creationType` `Custom`, no namespace in the name): every field and property;
- **everything else** (standard DMOs, the DMOs Salesforce generates for identity resolution, data graphs or segments, a custom DMO under a namespaced name, a read without `creationType`): custom fields, the object label and the object description only.

A whole-DMO delete is sent for every DMO, standard ones included, and Salesforce decides. This code means a deploy would create a new DMO with a namespaced name, or the org answered a DMO read without a name, so the plugin cannot tell what it would write to.

## Why the plugin stops

Salesforce does not allow a new DMO name with a namespace. A read without a name gives the plugin no target to bind the write to. The plugin refuses before any write.

## How to fix

1. Check the API name of the DMO in the org and in the file.
2. To create a new DMO, use a name without a namespace prefix.
3. If the org answers a DMO read without a name, read the DMO again later; report it if it persists.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dmo:acme__Thing__dlm; mutation: not-attempted.
UNSUPPORTED_DMO_TARGET: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The plugin does not send this DMO write: a new DMO with a namespaced name, or a write to a DMO whose read has no name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/UNSUPPORTED_DMO_TARGET.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DMO_FIELD_CHANGE`](../dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md) — a field change a deploy does not send.
- [`DMO_HTTP_ERROR`](../dmo/DMO_HTTP_ERROR.md) — Salesforce refused a request, for example a whole-DMO delete.
