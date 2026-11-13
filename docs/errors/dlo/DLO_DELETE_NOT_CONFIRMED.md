# `DLO_DELETE_NOT_CONFIRMED`

> Salesforce accepted the DLO DELETE, but the DLO could not be confirmed gone. Do not rerun the delete; read the DLO in the org first and act on what you find.

|              |                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                         |
| **Commands** | `sf data360 delete`                                                                      |
| **Outcome**  | `deletion-unconfirmed` — mutation `acknowledged`; the command exits with status `failed` |

## What it means

Salesforce answered the DELETE for the data lake object as accepted. The plugin then read the DLO once by name to confirm the result:

- a "not found" answer confirms the deletion;
- the same DLO in a `DELETING` state is reported as still processing.

Anything else gives this code: the DLO was still readable in another state, or the confirming read itself failed (for example a rate limit or a connection problem). In the second case the message carries the API detail of that read.

## Why the plugin stops

The DELETE was already sent once. Sending it again could act on a different object if the name was reused, and it cannot tell you more than a read can. The plugin never replays a delete; it reports what it saw and leaves the decision to you. Local files are kept because the deletion is not confirmed.

## How to fix

1. Read the DLO in the org by its exact API name.
2. If it is gone, the delete worked: remove the local `data360/dlo/<Name>__dll.dlo-meta.json` yourself if you no longer need it.
3. If it is in a `DELETING` state, wait and read it again.
4. If it is still active, check the org for the reason (dependents, permissions) before you run `sf data360 delete` again.

## Example output

```text
Delete: failed.
Unconfirmed: dlo:Orders__dll; mutation: acknowledged.
DLO_DELETE_NOT_CONFIRMED: Salesforce acknowledged the DELETE, but the DLO was still readable afterwards. Do not replay; read the DLO again before any further action.
Hint: Salesforce accepted the DLO DELETE, but the DLO could not be confirmed gone. Do not rerun the delete; read the DLO in the org first and act on what you find.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DELETE_NOT_CONFIRMED.md
```

## Related codes

- [`DLO_DELETE_UNCONFIRMED`](../dlo/DLO_DELETE_UNCONFIRMED.md) — the DELETE answer itself was not the expected one.
- [`DLO_DEPENDENCY_PENDING`](../dlo/DLO_DEPENDENCY_PENDING.md) — the delete was not sent because dependents are still listed.
- [`DMO_DELETE_NOT_CONFIRMED`](../dmo/DMO_DELETE_NOT_CONFIRMED.md) — the same result for data model objects.
