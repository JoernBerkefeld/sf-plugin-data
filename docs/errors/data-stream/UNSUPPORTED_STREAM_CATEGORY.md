# `UNSUPPORTED_STREAM_CATEGORY`

> The landing DLO of the stream reports no category, which the stream file cannot represent. Retrieve wrote the stream as-is; manage it in Salesforce.

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                       |
| **Commands** | `sf data360 retrieve`                                                                             |
| **Outcome**  | `success` — the stream file is written as-is (verbatim) with a warning; it is not an item failure |

## What it means

The stream file keeps the category of the landing DLO (`spec.newDlo.category`, for example `Other`, `Profile` or `Engagement`). This code means the stream read reports no category for its DLO.

## Why the plugin reports it

The plugin cannot create a DLO without a category, so it does not guess. It writes the stream GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, so nothing in the org is hidden.

## How to fix

1. Check the stream and its DLO in Data Cloud Setup.
2. Manage the stream in Salesforce. Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## Example output

```text
Retrieve: success.
Warning: data-stream:Web_Events: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_CATEGORY) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream:Web_Events (retrieved).
```

## Related codes

- [`UNSUPPORTED_STREAM_REFRESH`](../data-stream/UNSUPPORTED_STREAM_REFRESH.md) — a refresh mode other than UPSERT.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
