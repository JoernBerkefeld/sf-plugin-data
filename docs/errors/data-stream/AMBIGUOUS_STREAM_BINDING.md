# `AMBIGUOUS_STREAM_BINDING`

> The connection has more than one data stream, or a listed stream belongs to another connection. Use a connection that feeds exactly one Ingestion API stream.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

The plugin finds the target stream by its Ingestion API connection and event, not by the stream name, because Salesforce generates the name of a new stream itself. It lists every data stream of the connection named in `spec.connectionName`.

This code means the list did not lead to one clear target: the connection already feeds more than one data stream, or the list returned a stream whose data source is not that connection.

## Why the plugin stops

The connection read does not say which event a stream uses, so with two or more streams on one connection the plugin cannot tell which one the file describes. Guessing could update or delete the wrong stream, so it stops.

## How to fix

1. Check the connection in Data Cloud Setup and list its data streams.
2. If several streams use the connection, the plugin cannot handle that connection. Use a connection with a single Ingestion API stream, or manage the extra streams in Salesforce.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
AMBIGUOUS_STREAM_BINDING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The connection has more than one data stream, or a listed stream belongs to another connection. Use a connection that feeds exactly one Ingestion API stream.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/AMBIGUOUS_STREAM_BINDING.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`AMBIGUOUS_STREAM_CONNECTION`](../data-stream/AMBIGUOUS_STREAM_CONNECTION.md) — the connection itself could not be identified.
- [`AMBIGUOUS_STREAM_EVENT`](../data-stream/AMBIGUOUS_STREAM_EVENT.md) — the connection carries more than one event.
- [`STREAM_TARGET_MISMATCH`](../data-stream/STREAM_TARGET_MISMATCH.md) — the named stream is not the one found on the connection.
