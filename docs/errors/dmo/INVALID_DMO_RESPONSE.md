# `INVALID_DMO_RESPONSE`

> Salesforce returned a DMO answer the plugin could not read. Inspect the DMO in the org, especially if a write was sent, then rerun.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data model object                                                                                                  |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                    |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when it is the answer to a create or update |

## What it means

Salesforce answered with a success status, but the body was not what the plugin expects for a data model object: not valid JSON, not a single object, or without a name or field list.

## Why the plugin stops

The plugin builds the local file and its write decisions from this answer. An answer it cannot read gives it nothing to compare, and after a write it cannot confirm what was saved. It stops rather than guess.

## How to fix

1. Rerun the command once; a cut-off answer can be temporary.
2. If the item shows mutation `unknown`, read the DMO in the org before you deploy again.
3. If it keeps happening, read the DMO yourself (`sf api request rest /services/data/v68.0/ssot/data-model-objects/<Name>__dlm`) and check the answer.

## Example output

```text
Retrieve: failed.
dmo:Customer__dlm: INVALID_DMO_RESPONSE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: Salesforce returned a DMO answer the plugin could not read. Inspect the DMO in the org, especially if a write was sent, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/INVALID_DMO_RESPONSE.md
Downloaded dmo: 0
```

## Related codes

- [`DMO_REQUEST_UNCONFIRMED`](../dmo/DMO_REQUEST_UNCONFIRMED.md) — no readable status at all.
- [`INVALID_DLO_RESPONSE`](../dlo/INVALID_DLO_RESPONSE.md) — the same for data lake objects.
