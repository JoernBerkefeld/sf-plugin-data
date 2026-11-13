# `STREAM_UPDATE_SETTLEMENT_UNCONFIRMED`

> The stream update was sent, but the new mappings and ACTIVE status were not confirmed within 15 minutes. Check the stream in the org before you deploy again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

After an update, the plugin reads the stream and its DLO up to 20 times, about every 5 seconds, for at most 15 minutes. It reports success only when the new mappings and fields are there and the stream and DLO are `ACTIVE`.

This code means that was not seen in time, or the stream or DLO reached a status other than `ACTIVE` or `PROCESSING`.

## Why the plugin stops

The plugin reports an update as done only when it has seen the result. It does not wait longer or send the update again.

## How to fix

1. Check the stream in Data Cloud Setup. It may still be processing.
2. When it is active, run the same deploy with `--preview`: it reports `unchanged` if the mappings are in place.
3. If the stream shows an error, fix it in Salesforce first.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
STREAM_UPDATE_SETTLEMENT_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The stream update was sent, but the new mappings and ACTIVE status were not confirmed within 15 minutes. Check the stream in the org before you deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_UPDATE_SETTLEMENT_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`STREAM_CREATE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_CREATE_SETTLEMENT_UNCONFIRMED.md) — the create counterpart.
- [`STREAM_UPDATE_PRESERVATION_FAILED`](../data-stream/STREAM_UPDATE_PRESERVATION_FAILED.md) — the update changed more than requested.
