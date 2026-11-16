# `UNSUPPORTED_STREAM_CONNECTOR`

> The stream uses neither the Ingestion API nor the Salesforce CRM connector, for example an S3, Marketing Cloud Engagement or streaming-app stream. Retrieve wrote it as-is; manage it in Salesforce.

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                       |
| **Commands** | `sf data360 retrieve`                                                                             |
| **Outcome**  | `success` — the stream file is written as-is (verbatim) with a warning; it is not an item failure |

## What it means

The stream file format describes two kinds of data stream: Ingestion API streams and Salesforce CRM streams (`connectorInfo.connectorType` `SalesforceDotCom`). This code means the stream GET reports another connector, for example an Amazon S3, Marketing Cloud Engagement or streaming app stream.

Retrieve decides this from the stream GET alone and does not read the connection list or the event schema.

## Why the plugin reports it

The plugin cannot represent the connector in its normal file, so it does not guess. It writes the stream GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, so nothing in the org is hidden.

## How to fix

1. Manage the stream in Salesforce. Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).
2. Retrieve again after the plugin supports the connector; the normal file then replaces the verbatim one.

## Example output

```text
Retrieve: success.
Warning: data-stream:Orders_S3: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_CONNECTOR) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream:Orders_S3 (retrieved).
```

## Related codes

- [`UNSUPPORTED_STREAM_REFRESH`](../data-stream/UNSUPPORTED_STREAM_REFRESH.md) — an Ingestion API stream with another refresh mode.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
