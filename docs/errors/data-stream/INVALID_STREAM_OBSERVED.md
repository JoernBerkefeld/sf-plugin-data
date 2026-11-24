# `INVALID_STREAM_OBSERVED`

> The read-only observed section of the stream file is malformed or has duplicate entries. Do not edit observed; retrieve the stream again to refresh it.

|              |                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                 |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning |

## What it means

The `observed` section records what the plugin saw in the org at retrieve time: the stream's mappings, source fields, DLO fields and actual DLO name. It is not deployed. This code means that section is malformed: a list is missing, a mapping or field appears twice, a mapping has both or neither of `sourceFieldName` and `formula`, or `isPrimaryKey` is not true or false.

## Why the plugin stops

The plugin keeps `observed` as evidence and checks it like the rest of the document. A damaged section suggests the file was edited by hand, so the plugin does not trust it.

## How to fix

1. Do not edit `observed` by hand.
2. Retrieve the stream again with `sf data360 retrieve -m data-stream:<ApiName>` to refresh it, then reapply your `spec` changes.

## Example output

```text
Retrieve: success.
Warning: data-stream:WebOrders_Order_1a2b3c4d: retrieved as-is (verbatim, reason INVALID_STREAM_OBSERVED) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream: 1
```

## Related codes

- [`INVALID_STREAM_DOCUMENT`](../data-stream/INVALID_STREAM_DOCUMENT.md) — the rest of the document structure.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
