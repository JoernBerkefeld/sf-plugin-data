# `STREAM_HTTP_ERROR`

> Salesforce answered a stream create, update or delete with an error status. The change may still have happened; read the HTTP status, then inspect the org before you retry.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data stream                              |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `failed` — mutation `unknown`            |

## What it means

Salesforce answered a stream create, update or delete request with a status outside the 2xx range. The message shows the HTTP status and, when Salesforce sent them, its error code, error text and the request ID.

## Why the plugin stops

The request had already been sent. Salesforce may still have applied part of the change, so the plugin reports the outcome as unknown and does not retry.

## How to fix

1. Read the HTTP status and detail in the message: 400 usually means Salesforce rejected the request body, 401 or 403 a login or permission problem, 429 or 503 load or rate limits.
2. For 401 or 403, log in again with `sf org login web -a <alias>` and check your Data Cloud permissions.
3. If `mutation` is `unknown`, check the stream in Data Cloud Setup before you retry.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
STREAM_HTTP_ERROR: Salesforce API rejected the request (HTTP 400); no response payload is disclosed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: Salesforce answered a stream create, update or delete with an error status. The change may still have happened; read the HTTP status, then inspect the org before you retry.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_HTTP_ERROR.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`STREAM_REQUEST_UNCONFIRMED`](../data-stream/STREAM_REQUEST_UNCONFIRMED.md) — the answer could not be read at all.
- [`DATA_STREAM_REQUEST_UNCONFIRMED`](../data-stream/DATA_STREAM_REQUEST_UNCONFIRMED.md) — another unexpected error during deploy.
