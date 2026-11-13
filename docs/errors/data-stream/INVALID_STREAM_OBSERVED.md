# `INVALID_STREAM_OBSERVED`

> The read-only observed section of the stream file is malformed or has duplicate entries. Do not edit observed; retrieve the stream again to refresh it.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

The `observed` section records what the plugin saw in the org at retrieve time: the stream's mappings, source fields, DLO fields and actual DLO name. It is not deployed. This code means that section is malformed: a list is missing, a mapping or field appears twice, a mapping has both or neither of `sourceFieldName` and `formula`, or `isPrimaryKey` is not true or false.

## Why the plugin stops

The plugin keeps `observed` as evidence and checks it like the rest of the document. A damaged section suggests the file was edited by hand, so the plugin does not trust it.

## How to fix

1. Do not edit `observed` by hand.
2. Retrieve the stream again with `sf data360 retrieve -m data-stream:<ApiName> --overwrite` to refresh it, then reapply your `spec` changes.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_OBSERVED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The read-only observed section of the stream file is malformed or has duplicate entries. Do not edit observed; retrieve the stream again to refresh it.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_OBSERVED.md
Downloaded data-stream: 0
```

## Related codes

- [`INVALID_STREAM_DOCUMENT`](../data-stream/INVALID_STREAM_DOCUMENT.md) — the rest of the document structure.
