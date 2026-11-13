# `UNSUPPORTED_STREAM_SPEC`

> The stream file uses a value outside the supported profile. Use schemaVersion 1, IngestApi, INGEST_API, UPSERT, category Other and a Text primary key.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

Several values in a stream document are fixed. This code means one of them differs:

- `schemaVersion` must be `1` and `kind` must be `data-stream`,
- `spec.connectorType` must be `IngestApi`, `spec.datastreamType` `INGEST_API` and `spec.refreshMode` `UPSERT`,
- `spec.newDlo.category` must be `Other` and `spec.newDlo.primaryKey.dataType` `Text`,
- `spec.additiveFieldMappings` must be a list.

On retrieve it can come from an existing local file that is checked before being overwritten. A deploy file with such values is usually reported earlier as `INVALID_SOURCE`.

## Why the plugin stops

The plugin only supports Ingestion API streams of that profile. Other values would describe a stream it cannot create or check.

## How to fix

1. Compare your file with a freshly retrieved one and restore the fixed values.
2. For other stream types, manage the stream in Salesforce.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: UNSUPPORTED_STREAM_SPEC: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The stream file uses a value outside the supported profile. Use schemaVersion 1, IngestApi, INGEST_API, UPSERT, category Other and a Text primary key.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_SPEC.md
Downloaded data-stream: 0
```

## Related codes

- [`INVALID_STREAM_DOCUMENT`](../data-stream/INVALID_STREAM_DOCUMENT.md) — the structure of the document is wrong.
- [`UNSUPPORTED_STREAM_READ`](../data-stream/UNSUPPORTED_STREAM_READ.md) — the stream in the org is outside the profile.
