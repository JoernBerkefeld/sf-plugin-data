# `DMO_REQUEST_UNCONFIRMED`

> A DMO request ended without a readable answer from Salesforce. Check the org connection, inspect the target if a write was sent, then rerun.

|              |                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                 |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when a create, update or delete was sent |

## What it means

The plugin sent a request to the data model object API but could not confirm how it ended:

- the connection failed before an HTTP status arrived;
- the Salesforce CLI process that ran the request reported an error although a status was read;
- the status was a success code other than the one expected (for example "no content" for a read).

It is also the code used when a DMO deploy step fails for a reason that has no more specific code.

## Why the plugin stops

Without a clear answer the plugin cannot say whether a write took effect, and repeating it could duplicate it. It reports the outcome as unknown and does nothing more.

## How to fix

1. Check the network and the login of `--target-org` (`sf org display --target-org <alias>`).
2. If the item shows mutation `unknown`, read the DMO in the org to see whether the change was applied.
3. Rerun the command.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: dmo:Customer__dlm; mutation: unknown.
DMO_REQUEST_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: A DMO request ended without a readable answer from Salesforce. Check the org connection, inspect the target if a write was sent, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_REQUEST_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`DMO_HTTP_ERROR`](../dmo/DMO_HTTP_ERROR.md) — Salesforce answered with an HTTP error status.
- [`INVALID_DMO_RESPONSE`](../dmo/INVALID_DMO_RESPONSE.md) — a status arrived but the body could not be read.
- [`DLO_REQUEST_UNCONFIRMED`](../dlo/DLO_REQUEST_UNCONFIRMED.md) — the same for data lake object requests.
