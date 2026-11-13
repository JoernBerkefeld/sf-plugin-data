# `STREAM_CREATE_PERSISTENCE_UNCONFIRMED`

> The new stream was found, but its DLO label, primary key or default mappings differ from the request. Inspect the stream in the org before you deploy again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

After a create, the plugin retrieves the new stream and compares it with the request. It expects the DLO label and primary key from the file, no extra mappings, and one direct mapping for every source field of the event.

This code means the retrieved stream differs on one of these points.

## Why the plugin stops

The stream exists but not in the form requested. The plugin does not try to correct it, because that would be a second write it cannot confirm either.

## How to fix

1. Retrieve the stream by its generated name and compare it with your file.
2. Decide whether to keep it as it is, change it in Salesforce, or delete it with `sf data360 delete -m data-stream:<GeneratedName>`.
3. Deploy again only after that.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order; mutation: unknown.
STREAM_CREATE_PERSISTENCE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The new stream was found, but its DLO label, primary key or default mappings differ from the request. Inspect the stream in the org before you deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_CREATE_PERSISTENCE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`STREAM_CREATE_IDENTITY_UNCONFIRMED`](../data-stream/STREAM_CREATE_IDENTITY_UNCONFIRMED.md) — the new stream could not be found.
- [`STREAM_CREATE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_CREATE_SETTLEMENT_UNCONFIRMED.md) — the stream did not become active in time.
