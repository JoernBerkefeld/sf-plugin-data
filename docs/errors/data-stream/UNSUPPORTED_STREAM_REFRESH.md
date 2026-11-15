# `UNSUPPORTED_STREAM_REFRESH`

> The stream refreshes in a mode other than UPSERT, for example full refresh, which the stream file cannot represent. Retrieve wrote it as-is; manage it in Salesforce.

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                       |
| **Commands** | `sf data360 retrieve`                                                                             |
| **Outcome**  | `success` — the stream file is written as-is (verbatim) with a warning; it is not an item failure |

## What it means

The stream file format describes Ingestion API streams that refresh with `UPSERT`. This code means the stream GET reports another refresh mode, for example a full refresh.

## Why the plugin reports it

The plugin cannot represent the refresh mode in its normal file, so it does not guess. It writes the stream GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, so nothing in the org is hidden.

## How to fix

1. Manage the stream in Salesforce. Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).
2. Retrieve again after the plugin supports the refresh mode; the normal file then replaces the verbatim one.

## Example output

```text
Retrieve: success.
Warning: data-stream:Orders_Full: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_REFRESH) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream:Orders_Full (retrieved).
```

## Related codes

- [`UNSUPPORTED_STREAM_CONNECTOR`](../data-stream/UNSUPPORTED_STREAM_CONNECTOR.md) — a stream of another connector.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
