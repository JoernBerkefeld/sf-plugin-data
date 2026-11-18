# `UNSUPPORTED_STREAM_SPEC`

> The Ingestion API stream file uses a value outside its shape. Use schemaVersion 1, IngestApi and INGEST_API; a stream of another connector keeps its connector in spec.connectorInfo.

|              |                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                 |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning |

## What it means

A few values of the Ingestion API stream file are fixed. This code means one of them differs:

- `schemaVersion` must be `1` and `kind` must be `data-stream`,
- `spec.connectorType` must be `IngestApi` and `spec.datastreamType` `INGEST_API`, each in any letter case (the value is sent as written; the message names the key that differs),
- `spec.additiveFieldMappings` must be a list, and `spec.formulaMappings` a list when present.

A stream of another connector uses the GET-shaped file, which keeps its connector in `spec.connectorInfo`. The refresh mode, DLO category and field types are sent as written and Salesforce decides.

On retrieve it can come from an existing local file that is checked before being overwritten. A deploy file with such values is usually reported earlier as `INVALID_SOURCE`.

## Why the plugin stops

These values select the file shape: the Ingestion API create needs a connection and an event, which only this shape carries. With other values the plugin cannot build the request.

## How to fix

1. Compare your file with a freshly retrieved one and restore the fixed values.
2. For a stream of another connector, retrieve it: it is written in the GET-shaped file.

## Example output

```text
Retrieve: success.
Warning: data-stream:WebOrders_Order_1a2b3c4d: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_SPEC) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream: 1
```

## Related codes

- [`INVALID_STREAM_DOCUMENT`](../data-stream/INVALID_STREAM_DOCUMENT.md) — the structure of the document is wrong.
- [`UNSUPPORTED_STREAM_READ`](../data-stream/UNSUPPORTED_STREAM_READ.md) — the stream in the org is outside the profile.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
