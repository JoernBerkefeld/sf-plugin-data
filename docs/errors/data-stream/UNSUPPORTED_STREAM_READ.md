# `UNSUPPORTED_STREAM_READ`

> The stream is outside the supported profile: Ingestion API, UPSERT, category Other, default data space. Manage this stream in Salesforce.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The plugin supports one kind of data stream: an Ingestion API stream with refresh mode `UPSERT` whose landing DLO has category `Other` and is in the `default` data space only. This code means a stream it read is different: another stream or connector type, another refresh mode, another DLO category or data space, or a stream without a name, record ID, data source, status, label, source field list or mapping list.

It also appears when another stream of a different kind shares the connection.

## Why the plugin stops

The plugin's checks and file format are built for that one profile. Reading or changing other streams could lose settings it does not know.

## How to fix

1. Check the stream's type, refresh mode and DLO in Data Cloud Setup.
2. Use the plugin only for supported Ingestion API streams; manage the others in Salesforce.

## Example output

```text
Retrieve: failed.
data-stream:SalesOrders_Stream: UNSUPPORTED_STREAM_READ: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The stream is outside the supported profile: Ingestion API, UPSERT, category Other, default data space. Manage this stream in Salesforce.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_READ.md
Downloaded data-stream: 0
```

## Related codes

- [`UNSUPPORTED_STREAM_PROJECTION`](../data-stream/UNSUPPORTED_STREAM_PROJECTION.md) — the stream is supported but a mapping is not.
- [`INVALID_STREAM_READ`](../data-stream/INVALID_STREAM_READ.md) — the answer was not readable at all.
