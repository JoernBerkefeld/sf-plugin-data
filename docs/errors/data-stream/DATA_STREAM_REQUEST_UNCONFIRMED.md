# `DATA_STREAM_REQUEST_UNCONFIRMED`

> The stream deploy stopped on an unexpected error. If the result says mutation unknown, inspect the stream in the org before you deploy again.

|              |                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                               |
| **Commands** | `sf data360 deploy`                                                                                                       |
| **Outcome**  | `blocked` when the error came before the write — nothing was changed; `failed` with mutation `unknown` when it came after |

## What it means

The plugin uses this code when a stream deploy stops on an error that has no more specific data stream code, for example a failed connection, DLO or schema read, a network problem or an authentication error.

Read the `mutation` value. `not-attempted` means the error happened during the checks and nothing was changed. `unknown` means the create or update request had already been sent.

## Why the plugin stops

After a write has been sent, the plugin cannot tell whether Salesforce applied it, so it does not retry or assume either result. Before the write it stops because the checks did not finish.

## How to fix

1. Read the message: it names a Salesforce HTTP status or rate limit when one was involved.
2. If `mutation` is `unknown`, check the stream in Data Cloud Setup. Then retrieve it with `sf data360 retrieve -m data-stream:<ApiName>` to see its current state.
3. Fix the cause and run the deploy with `--preview` before deploying again.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
DATA_STREAM_REQUEST_UNCONFIRMED: Salesforce API authentication or authorization failed (HTTP 401); no authentication response is disclosed. No write attempted; correct the reported check before another attempt.
Hint: The stream deploy stopped on an unexpected error. If the result says mutation unknown, inspect the stream in the org before you deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/DATA_STREAM_REQUEST_UNCONFIRMED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`STREAM_REQUEST_UNCONFIRMED`](../data-stream/STREAM_REQUEST_UNCONFIRMED.md) — the request was sent but its answer could not be read.
- [`STREAM_HTTP_ERROR`](../data-stream/STREAM_HTTP_ERROR.md) — Salesforce answered with an error status.
- [`DEPLOY_EXECUTION_FAILED`](../general/DEPLOY_EXECUTION_FAILED.md) — the general code for a deploy that did not complete.
