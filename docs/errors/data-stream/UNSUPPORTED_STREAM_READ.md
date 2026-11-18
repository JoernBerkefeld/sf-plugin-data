# `UNSUPPORTED_STREAM_READ`

> The Ingestion API stream read is outside what the stream file can hold: another stream type, no refresh mode, another data space, or missing names or lists. Manage this stream in Salesforce.

|              |                                                                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                                                                                                            |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                                                                                               |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

An Ingestion API stream file holds a stream of type `INGESTAPI` on the `IngestApi` connector, with a refresh mode, whose landing DLO is in the `default` data space only (with or without a category). This code means a stream it read is different: another stream type, no refresh mode, another data space, or a stream without a name, record ID, data source, status, label, source field list or mapping list.

It also appears when another stream of a different kind shares the connection.

## Why the plugin stops

The plugin's checks and the Ingestion API file are built for that shape. Reading or changing such a stream could lose settings the file cannot hold.

## How to fix

1. Check the stream's type and DLO in Data Cloud Setup.
2. Manage such a stream in Salesforce.

## Example output

```text
Retrieve: success.
Warning: data-stream:SalesOrders_Stream: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_READ) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream: 1
```

## Related codes

- [`UNSUPPORTED_STREAM_PROJECTION`](../data-stream/UNSUPPORTED_STREAM_PROJECTION.md) — the stream is supported but a mapping is not.
- [`INVALID_STREAM_READ`](../data-stream/INVALID_STREAM_READ.md) — the answer was not readable at all.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
