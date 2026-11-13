# `STREAM_DELETE_UNCONFIRMED`

> Salesforce answered the stream DELETE without the expected empty success. The stream may be deleted; check it in the org before you run the delete again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 delete`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

A successful stream delete answers with HTTP 204 and no body. This code means the answer was a success status but carried a body, or was not the expected empty answer.

## Why the plugin stops

The request reached Salesforce, so the stream may be deleted. The plugin cannot read the outcome from the answer and does not send the request again.

## How to fix

1. Check the stream (and, with `--delete-dlo`, its DLO) in Data Cloud Setup.
2. When the stream is gone, run the delete with `--preview` to confirm.
3. If it is still there, look for an error in Salesforce before trying again.

## Example output

```text
Delete: failed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
STREAM_DELETE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: Salesforce answered the stream DELETE without the expected empty success. The stream may be deleted; check it in the org before you run the delete again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DELETE_UNCONFIRMED.md
```

## Related codes

- [`STREAM_DELETE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_DELETE_SETTLEMENT_UNCONFIRMED.md) — the request was accepted but absence was not confirmed.
- [`STREAM_REQUEST_UNCONFIRMED`](../data-stream/STREAM_REQUEST_UNCONFIRMED.md) — the answer could not be read at all.
