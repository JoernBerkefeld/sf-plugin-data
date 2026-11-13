# `DATA_STREAM_DELETE_UNCONFIRMED`

> The stream delete stopped on an unexpected error. If the result says mutation unknown, inspect the stream and its DLO in the org before you run the delete again.

|              |                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                        |
| **Commands** | `sf data360 delete`                                                                                                                |
| **Outcome**  | `blocked` when the error came before the DELETE request — nothing was changed; `failed` with mutation `unknown` when it came after |

## What it means

The plugin uses this code when a stream delete stops on an error that has no more specific data stream code, for example a failed connection, DLO or dependency read, a network problem or an authentication error.

Read the `mutation` value. `not-attempted` means the error happened during the checks before the DELETE request and nothing was changed. `unknown` means the DELETE request had already been sent, so the stream and possibly its DLO may be gone.

## Why the plugin stops

After the request has been sent the plugin cannot tell whether Salesforce deleted the stream, so it does not retry or assume either result. Before the request it stops because the checks did not finish.

## How to fix

1. Read the message: it names a Salesforce HTTP status or rate limit when one was involved.
2. If `mutation` is `unknown`, check in Data Cloud Setup whether the stream (and, with `--delete-dlo`, its DLO) still exists before you do anything else.
3. Fix the cause (sign in again, wait for a rate limit, check permissions) and rerun the delete. Run `--preview` first if the stream may already be gone.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
DATA_STREAM_DELETE_UNCONFIRMED: Salesforce API rejected the request (HTTP 403); no response payload is disclosed. No deletion attempted; correct the reported check before another attempt.
Hint: The stream delete stopped on an unexpected error. If the result says mutation unknown, inspect the stream and its DLO in the org before you run the delete again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/DATA_STREAM_DELETE_UNCONFIRMED.md
```

## Related codes

- [`STREAM_DELETE_UNCONFIRMED`](../data-stream/STREAM_DELETE_UNCONFIRMED.md) — Salesforce answered the DELETE in an unexpected way.
- [`STREAM_DELETE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_DELETE_SETTLEMENT_UNCONFIRMED.md) — the request was sent but the deletion could not be confirmed.
- [`DELETE_FAILED`](../general/DELETE_FAILED.md) — the general code when a delete stops outside the stream checks.
