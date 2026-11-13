# `STREAM_DELETE_SETTLEMENT_UNCONFIRMED`

> The stream delete was sent, but its absence was not confirmed within 15 minutes. Check the stream and its DLO in the org before you run the delete again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 delete`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

After the DELETE request, the plugin reads the stream, the connection's stream list and the event up to 20 times, about every 5 seconds, for at most 15 minutes. It reports success only when the stream reads as not found, the connection lists no stream, and the event is `Available` again (and, with `--delete-dlo`, the DLO is gone too).

This code means that state was not reached in time.

## Why the plugin stops

The request was sent but the plugin did not see the result. It does not send it again, because that could act on a stream that is already being removed.

## How to fix

1. Check the stream in Data Cloud Setup. A delete can still be in progress.
2. When it is gone, run `sf data360 delete -m data-stream:<ApiName> --preview` to confirm.
3. If it is still there after a while, look for an error on it in Salesforce before trying again.

## Example output

```text
Delete: failed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
STREAM_DELETE_SETTLEMENT_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The stream delete was sent, but its absence was not confirmed within 15 minutes. Check the stream and its DLO in the org before you run the delete again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DELETE_SETTLEMENT_UNCONFIRMED.md
```

## Related codes

- [`STREAM_DELETE_UNCONFIRMED`](../data-stream/STREAM_DELETE_UNCONFIRMED.md) — the DELETE answer itself was unexpected.
- [`STREAM_PROPOSED_DLO_EXISTS`](../data-stream/STREAM_PROPOSED_DLO_EXISTS.md) — with `--delete-dlo`, the DLO was still there.
