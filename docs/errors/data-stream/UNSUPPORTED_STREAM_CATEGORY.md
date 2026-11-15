# `UNSUPPORTED_STREAM_CATEGORY`

> The landing DLO of the stream has a category other than Other, which the stream file cannot represent. Retrieve wrote the stream as-is; manage it in Salesforce.

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                       |
| **Commands** | `sf data360 retrieve`                                                                             |
| **Outcome**  | `success` — the stream file is written as-is (verbatim) with a warning; it is not an item failure |

## What it means

The stream file format creates landing DLOs with category `Other`. This code means the landing DLO of the stream has another category, for example `Profile` or `Engagement`.

## Why the plugin reports it

The plugin cannot represent the category in its normal file, so it does not guess. It writes the stream GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, so nothing in the org is hidden.

## How to fix

1. Manage the stream in Salesforce. Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).
2. Retrieve again after the plugin supports the category; the normal file then replaces the verbatim one.

## Example output

```text
Retrieve: success.
Warning: data-stream:Web_Events: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_CATEGORY) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream:Web_Events (retrieved).
```

## Related codes

- [`UNSUPPORTED_STREAM_FIELD_TYPE`](../data-stream/UNSUPPORTED_STREAM_FIELD_TYPE.md) — a source field that is not Text.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
