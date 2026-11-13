# `INVALID_STREAM_RESPONSE`

> Salesforce accepted the stream create or update but its answer was not a JSON object. The write may have happened; inspect the stream in the org before you deploy again.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

After a stream create (HTTP 201) or update (HTTP 200), the plugin reads the answer body. This code means the status was the expected success but the body was empty, not JSON, or not a JSON object.

## Why the plugin stops

The request was sent and probably applied, but the plugin cannot read the created or updated stream from the answer. It does not retry, because a second create could make a duplicate stream.

## How to fix

1. Check the stream in Data Cloud Setup: does it exist, and does it have the new mappings?
2. Retrieve it with `sf data360 retrieve -m data-stream:<ApiName>` (for a new stream, use the name Salesforce generated).
3. Run the deploy with `--preview` before deploying again.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
INVALID_STREAM_RESPONSE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: Salesforce accepted the stream create or update but its answer was not a JSON object. The write may have happened; inspect the stream in the org before you deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_RESPONSE.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`STREAM_REQUEST_UNCONFIRMED`](../data-stream/STREAM_REQUEST_UNCONFIRMED.md) — the answer could not be read at all.
- [`STREAM_CREATE_UNCONFIRMED`](../data-stream/STREAM_CREATE_UNCONFIRMED.md) — the create answer did not carry the new stream's name and ID.
