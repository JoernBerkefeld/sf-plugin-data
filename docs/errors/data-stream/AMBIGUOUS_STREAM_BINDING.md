# `AMBIGUOUS_STREAM_BINDING`

> Several data streams on the connection read the same event, or a listed stream belongs to another connection. Keep one stream per event in Salesforce, then rerun.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

The plugin finds the target stream by its Ingestion API connection and event, not by the stream name, because Salesforce generates the name of a new stream itself. It lists every data stream of the connection named in `spec.connectionName` and keeps the streams of the event named in `spec.event` (see [`AMBIGUOUS_STREAM_EVENT`](../data-stream/AMBIGUOUS_STREAM_EVENT.md) for how a stream is tied to its event).

This code means the list did not lead to one clear target: more than one stream reads that event, or the list returned a stream whose data source is not that connection.

## Why the plugin stops

With two streams for one event the plugin cannot tell which one the file describes. Guessing could update or delete the wrong stream, so it stops.

## How to fix

1. Check the connection in Data Cloud Setup and list its data streams.
2. Keep one stream per event; manage or delete the extra stream in Salesforce.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
AMBIGUOUS_STREAM_BINDING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: Several data streams on the connection read the same event, or a listed stream belongs to another connection. Keep one stream per event in Salesforce, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/AMBIGUOUS_STREAM_BINDING.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`AMBIGUOUS_STREAM_CONNECTION`](../data-stream/AMBIGUOUS_STREAM_CONNECTION.md) — the connection itself could not be identified.
- [`AMBIGUOUS_STREAM_EVENT`](../data-stream/AMBIGUOUS_STREAM_EVENT.md) — the stream could not be tied to one event.
- [`STREAM_TARGET_MISMATCH`](../data-stream/STREAM_TARGET_MISMATCH.md) — the named stream is not the one found on the connection.
