# `UNSUPPORTED_STREAM_FIELD_TYPE`

> The stream has a source field that is not Text, which the stream file cannot represent. Retrieve wrote the stream as-is; manage it in Salesforce.

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                       |
| **Commands** | `sf data360 retrieve`                                                                             |
| **Outcome**  | `success` — the stream file is written as-is (verbatim) with a warning; it is not an item failure |

## What it means

The stream file format describes streams whose source fields are all Text. This code means the stream GET lists a source field of another type, for example a number or a date.

## Why the plugin reports it

The plugin cannot represent other field types in its normal file, so it does not guess. It writes the stream GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, so nothing in the org is hidden.

## How to fix

1. Manage the stream in Salesforce. Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).
2. Retrieve again after the plugin supports other field types; the normal file then replaces the verbatim one.

## Example output

```text
Retrieve: success.
Warning: data-stream:Orders_Typed: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_FIELD_TYPE) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream:Orders_Typed (retrieved).
```

## Related codes

- [`UNSUPPORTED_STREAM_CATEGORY`](../data-stream/UNSUPPORTED_STREAM_CATEGORY.md) — a landing DLO of another category.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
