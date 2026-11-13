# `DATA_STREAM_RETRIEVE_FAILED`

> The stream retrieve stopped on an unexpected error. Check the target org, your access and the network, then rerun the retrieve.

|              |                                                |
| ------------ | ---------------------------------------------- |
| **Family**   | Data stream                                    |
| **Commands** | `sf data360 retrieve`                          |
| **Outcome**  | `failed` — no file was written for that stream |

## What it means

The plugin uses this code when retrieving a data stream stops on an error that has no more specific data stream code, for example a failed connection, schema or DLO read, an authentication problem, a rate limit or a network error.

Nothing changes in the org: retrieve only reads.

## Why the plugin stops

The plugin writes a stream file only after every read has succeeded and the document has been checked. A partial result could look complete, so it writes nothing for that stream.

## How to fix

1. Read the message: it names a Salesforce HTTP status or rate limit when one was involved.
2. Check that the stream name is correct and that your user can read Data Cloud connections, streams and DLOs.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: DATA_STREAM_RETRIEVE_FAILED: Salesforce API authentication or authorization failed (HTTP 403); no authentication response is disclosed. Data stream retrieval did not complete; no write attempted.
Hint: The stream retrieve stopped on an unexpected error. Check the target org, your access and the network, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/DATA_STREAM_RETRIEVE_FAILED.md
Downloaded data-stream: 0
```

## Related codes

- [`STREAM_REQUEST_UNCONFIRMED`](../data-stream/STREAM_REQUEST_UNCONFIRMED.md) — a stream read could not be completed.
- [`UNSUPPORTED_STREAM_READ`](../data-stream/UNSUPPORTED_STREAM_READ.md) — the stream exists but is outside the supported profile.
