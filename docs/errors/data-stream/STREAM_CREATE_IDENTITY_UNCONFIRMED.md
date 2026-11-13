# `STREAM_CREATE_IDENTITY_UNCONFIRMED`

> The stream create was sent, but the new stream could not be found on the connection with the returned name and ID. Inspect the connection's streams before you deploy again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

After a create, Salesforce answers with the generated stream name and record ID. The plugin then lists the connection's streams again and expects to find exactly that stream, on the same connection and with the same source fields as before the create.

This code means the stream it found did not match: no stream, a different name or ID, another connection ID, or different source fields.

## Why the plugin stops

The create was sent, so a stream may exist. The plugin cannot confirm it is the stream it created, so it does not continue and does not retry, which could create a second stream.

## How to fix

1. Open the connection in Data Cloud Setup and look at its data streams.
2. If the new stream exists, retrieve it by its generated name with `sf data360 retrieve -m data-stream:<GeneratedName>` and keep that file.
3. Do not deploy the original file again until you know whether the stream was created.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order; mutation: unknown.
STREAM_CREATE_IDENTITY_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The stream create was sent, but the new stream could not be found on the connection with the returned name and ID. Inspect the connection's streams before you deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_CREATE_IDENTITY_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`STREAM_CREATE_UNCONFIRMED`](../data-stream/STREAM_CREATE_UNCONFIRMED.md) — the create answer itself was incomplete.
- [`STREAM_CREATE_PERSISTENCE_UNCONFIRMED`](../data-stream/STREAM_CREATE_PERSISTENCE_UNCONFIRMED.md) — the stream was found but its settings differ.
- [`STREAM_CREATE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_CREATE_SETTLEMENT_UNCONFIRMED.md) — the stream did not become active in time.
