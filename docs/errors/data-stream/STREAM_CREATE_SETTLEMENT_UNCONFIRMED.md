# `STREAM_CREATE_SETTLEMENT_UNCONFIRMED`

> The stream was created but did not become ACTIVE within 15 minutes, or reached another status. Check the stream and its DLO in the org before you deploy again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

After a create, the plugin reads the stream and its DLO up to 20 times, about every 5 seconds, for at most 15 minutes. It reports success only when the stream and its DLO are both `ACTIVE` and match the request.

This code means that did not happen in time, or the stream or DLO reached a status other than `ACTIVE` or `PROCESSING` (for example an error status).

## Why the plugin stops

The plugin reports a create as done only when it has seen the stream active. It does not wait longer or retry, because the outcome is outside its control.

## How to fix

1. Check the stream and its DLO in Data Cloud Setup.
2. If they are still processing, wait. Then retrieve the stream by its generated name.
3. If the stream shows an error, fix the cause in Salesforce or delete the stream before you deploy again.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order; mutation: unknown.
STREAM_CREATE_SETTLEMENT_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The stream was created but did not become ACTIVE within 15 minutes, or reached another status. Check the stream and its DLO in the org before you deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_CREATE_SETTLEMENT_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`STREAM_SNAPSHOT_PENDING`](../data-stream/STREAM_SNAPSHOT_PENDING.md) — a status change between reads, which the plugin waits out.
- [`STREAM_UPDATE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_UPDATE_SETTLEMENT_UNCONFIRMED.md) — the update counterpart.
