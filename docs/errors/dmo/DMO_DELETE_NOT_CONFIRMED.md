# `DMO_DELETE_NOT_CONFIRMED`

> Salesforce accepted the DMO DELETE, but the DMO could not be confirmed gone. Do not rerun the delete; read the DMO in the org first and act on what you find.

|              |                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                        |
| **Commands** | `sf data360 delete`                                                                      |
| **Outcome**  | `deletion-unconfirmed` — mutation `acknowledged`; the command exits with status `failed` |

## What it means

Salesforce accepted the DELETE for the data model object. The plugin then read the DMO once by name:

- "not found" confirms the deletion;
- the same DMO in a `DELETING` state is reported as still processing.

Anything else gives this code: the DMO was still readable in another state, or the confirming read failed (for example a rate limit). In the second case the message carries the API detail of that read.

## Why the plugin stops

The DELETE was already sent once. The plugin never replays it; a second DELETE cannot tell you more than a read can. It reports what it saw and keeps the local file because the deletion is not confirmed.

## How to fix

1. Read the DMO in the org by its exact API name.
2. If it is gone, remove `data360/dmo/<Name>__dlm.dmo-meta.json` yourself if you no longer need it.
3. If it is in a `DELETING` state, wait and read it again.
4. If it is still active, find out why (dependents such as mappings or segments, permissions) before you delete again.

## Example output

```text
Delete: failed.
Unconfirmed: dmo:Customer__dlm; mutation: acknowledged.
DMO_DELETE_NOT_CONFIRMED: Salesforce acknowledged the DELETE, but the DMO was still readable afterwards. Do not replay; read the DMO again before any further action.
Hint: Salesforce accepted the DMO DELETE, but the DMO could not be confirmed gone. Do not rerun the delete; read the DMO in the org first and act on what you find.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_DELETE_NOT_CONFIRMED.md
```

## Related codes

- [`DMO_DELETE_UNCONFIRMED`](../dmo/DMO_DELETE_UNCONFIRMED.md) — the DELETE answer itself was not the expected one.
- [`DLO_DELETE_NOT_CONFIRMED`](../dlo/DLO_DELETE_NOT_CONFIRMED.md) — the same result for data lake objects.
