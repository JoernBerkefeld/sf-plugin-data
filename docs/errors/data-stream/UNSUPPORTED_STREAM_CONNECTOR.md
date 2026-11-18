# `UNSUPPORTED_STREAM_CONNECTOR`

> The stream GET names no connector type, or the Ingestion API connector with another stream type, which fits no stream file. Retrieve wrote it as-is; manage it in Salesforce.

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                       |
| **Commands** | `sf data360 retrieve`                                                                             |
| **Outcome**  | `success` — the stream file is written as-is (verbatim) with a warning; it is not an item failure |

## What it means

The stream file has two shapes: the Ingestion API shape (connection and event) and the GET-shaped file for every other connector (`spec.connectorInfo.connectorType`, for example `SalesforceDotCom`). This code means the stream GET fits neither: it names no connector type, or it names the Ingestion API connector with another stream type than `INGESTAPI`.

Retrieve decides this from the stream GET alone and does not read the connection list or the event schema.

## Why the plugin reports it

The plugin cannot tell which file shape the stream needs, so it does not guess. It writes the stream GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, so nothing in the org is hidden.

## How to fix

1. Check the stream's connector in Data Cloud Setup.
2. Manage the stream in Salesforce. Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## Example output

```text
Retrieve: success.
Warning: data-stream:Orders_Unknown: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_CONNECTOR) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream:Orders_Unknown (retrieved).
```

## Related codes

- [`UNSUPPORTED_STREAM_READ`](../data-stream/UNSUPPORTED_STREAM_READ.md) — an Ingestion API stream outside what the file holds.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
