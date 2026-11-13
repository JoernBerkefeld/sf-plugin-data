# `INVALID_DLO_RESPONSE`

> Salesforce returned a DLO answer the plugin could not read. Inspect the DLO in the org, especially if a write was sent, then rerun.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data lake object                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                    |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when it is the answer to a create or update |

## What it means

Salesforce answered with a success status, but the body was not what the plugin expects for a data lake object: it was not valid JSON, not a single object, or had no field list.

## Why the plugin stops

The plugin builds the local file and its write decisions from this answer. An answer it cannot read gives it nothing to compare with, and after a write it cannot confirm what was saved. It stops rather than guess.

## How to fix

1. Rerun the command once; a cut-off answer can be temporary.
2. If the item shows mutation `unknown`, read the DLO in the org before you deploy again.
3. If it keeps happening, read the DLO yourself (`sf api request rest /services/data/v68.0/ssot/data-lake-objects/<Name>__dll`) and check the answer.

## Example output

```text
Retrieve: failed.
dlo:Orders__dll: INVALID_DLO_RESPONSE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: Salesforce returned a DLO answer the plugin could not read. Inspect the DLO in the org, especially if a write was sent, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/INVALID_DLO_RESPONSE.md
Downloaded dlo: 0
```

## Related codes

- [`AMBIGUOUS_DLO_RESPONSE`](../dlo/AMBIGUOUS_DLO_RESPONSE.md) — the answer held no or several DLOs.
- [`DLO_REQUEST_UNCONFIRMED`](../dlo/DLO_REQUEST_UNCONFIRMED.md) — no readable status at all.
- [`INVALID_DMO_RESPONSE`](../dmo/INVALID_DMO_RESPONSE.md) — the same for data model objects.
