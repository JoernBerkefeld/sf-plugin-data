# `AMBIGUOUS_DLO_RESPONSE`

> Salesforce returned zero or several data lake objects where exactly one was expected. Check that the name is unique in the org, then rerun.

|              |                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data lake object                                                                                                                           |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                                            |
| **Outcome**  | `blocked` when it happens on the read before a write; `failed` with mutation `unknown` when it happens on the answer to a create or update |

## What it means

Every DLO read and write names exactly one data lake object. Salesforce can answer with a wrapper that holds a list of DLOs. The plugin accepts that wrapper only when the list holds exactly one entry; an empty list or a list with several entries gives this code.

On a read before any write (retrieve, deploy preflight, delete lookup) nothing was changed. On the answer to a create or update the write was already sent, so the plugin cannot tell from the answer what was written.

## Why the plugin stops

The plugin binds every write to one exact target. If the answer could stand for none or for several objects, picking one would risk updating, saving or deleting the wrong DLO. Stopping keeps the org and the project files as they are.

## How to fix

1. Look up the DLO by its exact API name in the org (Data Cloud setup, or `sf api request rest /services/data/v68.0/ssot/data-lake-objects/<Name>__dll`).
2. Make sure exactly one DLO has that name in the data space you use.
3. If the code came after a create or update (mutation `unknown`), check whether the change is already there before you deploy again.
4. Rerun the command.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: dlo:Orders__dll; mutation: unknown.
AMBIGUOUS_DLO_RESPONSE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt.
Hint: Salesforce returned zero or several data lake objects where exactly one was expected. Check that the name is unique in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/AMBIGUOUS_DLO_RESPONSE.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`INVALID_DLO_RESPONSE`](../dlo/INVALID_DLO_RESPONSE.md) — the answer could not be read at all.
- [`DLO_TARGET_IDENTITY_MISMATCH`](../dlo/DLO_TARGET_IDENTITY_MISMATCH.md) — the one object returned is not the one requested.
