# `STREAM_CREATE_UNCONFIRMED`

> Salesforce accepted the stream create but its answer lacked a valid stream name or record ID. A stream may exist; inspect the connection's streams before you deploy again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

Salesforce names a new Ingestion API stream itself (`<connection>_<event>_<8 hex characters>`) and returns that name and its record ID in the create answer. This code means the answer arrived but did not contain a valid name or a 15- or 18-character record ID.

## Why the plugin stops

Without the generated name and ID the plugin cannot find and confirm the new stream. It does not retry, because a second create could make a duplicate.

## How to fix

1. Open the connection in Data Cloud Setup and look for a new stream.
2. If it exists, retrieve it with `sf data360 retrieve -m data-stream:<GeneratedName>`.
3. Deploy the original file again only if no stream was created.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order; mutation: unknown.
STREAM_CREATE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: Salesforce accepted the stream create but its answer lacked a valid stream name or record ID. A stream may exist; inspect the connection's streams before you deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_CREATE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`INVALID_STREAM_RESPONSE`](../data-stream/INVALID_STREAM_RESPONSE.md) — the create answer was not a JSON object at all.
- [`STREAM_CREATE_IDENTITY_UNCONFIRMED`](../data-stream/STREAM_CREATE_IDENTITY_UNCONFIRMED.md) — the name and ID were returned but could not be confirmed.
