# `NATIVE_RETRIEVE_FAILED`

> This DLO, DMO, mapping or relationship could not be retrieved for a reason without a more specific code. Read the message, check the org session, then rerun.

|              |                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                                             |
| **Commands** | `sf data360 retrieve`                                                                                               |
| **Outcome**  | `failed` — the component was not retrieved and no file was written for it; other components may have been retrieved |

## What it means

Retrieving one native component (DLO, DMO, mapping or relationship) stopped on an error that the family checks did not classify, for example an unexpected error while reading it or writing its file. The message shows whether Salesforce rejected a request (with the HTTP status) or a plugin check failed.

## Why the plugin stops

Each native component is retrieved on its own; one failure does not undo the others. The plugin writes nothing for the failed component, reports it and exits nonzero.

## How to fix

1. Read the message. An HTTP status points at the org, session or permissions.
2. Check the session: `sf org display --target-org <alias>`.
3. Rerun the retrieve for that component: `sf data360 retrieve -m <type>:<ApiName>`.

## Example output

```text
Retrieve: failed.
Downloaded dmo:Account__dlm (retrieved).
dmo:Customer__dlm: NATIVE_RETRIEVE_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: This DLO, DMO, mapping or relationship could not be retrieved for a reason without a more specific code. Read the message, check the org session, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/NATIVE_RETRIEVE_FAILED.md
Downloaded dmo: 1
```

## Related codes

- [`RETRIEVE_FAILED`](../general/RETRIEVE_FAILED.md) — the same kind of failure for the other families.
- [`NATIVE_INVENTORY_FAILED`](../general/NATIVE_INVENTORY_FAILED.md) — the listing step failed instead.
