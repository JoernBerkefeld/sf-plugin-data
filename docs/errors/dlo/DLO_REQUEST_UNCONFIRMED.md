# `DLO_REQUEST_UNCONFIRMED`

> A DLO request ended without a readable answer from Salesforce. Check the org connection, inspect the target if a write was sent, then rerun.

|              |                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                                                                |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                                 |
| **Outcome**  | `blocked` when it happens on a read before any write; `failed` with mutation `unknown` when a create, update or delete was sent |

## What it means

The plugin sent a request to the data lake object API but could not confirm how it ended. Typical causes:

- the connection failed before an HTTP status arrived;
- the Salesforce CLI process that ran the request reported an error even though a status was read;
- the status was a success code other than the one expected for that request (for example 200 instead of 201 for a create, or "no content" for a read).

## Why the plugin stops

Without a clear answer the plugin cannot say whether a write took effect. Treating it as success or failure could both be wrong, and repeating the write could duplicate it. The plugin reports the outcome as unknown and does nothing more.

## How to fix

1. Check the network and the login of `--target-org` (`sf org display --target-org <alias>`).
2. If the item shows mutation `unknown`, read the DLO in the org to see whether the change was applied.
3. Rerun the command.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: dlo:Orders__dll; mutation: unknown.
DLO_REQUEST_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt.
Hint: A DLO request ended without a readable answer from Salesforce. Check the org connection, inspect the target if a write was sent, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_REQUEST_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`DLO_HTTP_ERROR`](../dlo/DLO_HTTP_ERROR.md) — Salesforce answered with an HTTP error status.
- [`INVALID_DLO_RESPONSE`](../dlo/INVALID_DLO_RESPONSE.md) — a status arrived but the body could not be read.
- [`DMO_REQUEST_UNCONFIRMED`](../dmo/DMO_REQUEST_UNCONFIRMED.md) — the same for data model object requests.
