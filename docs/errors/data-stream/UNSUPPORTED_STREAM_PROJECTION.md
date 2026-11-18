# `UNSUPPORTED_STREAM_PROJECTION`

> The stream has a mapping the file cannot represent: from a field the event lacks or from a label several event fields share, onto a field the DLO lacks, or with both source and formula. Manage it in Salesforce.

|              |                                                                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                                                                                                            |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                                                                                               |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

When the plugin turns an Ingestion API stream into a file, it keeps each source field mapped to the field of the same name, the system mappings Salesforce adds (data source, data source object and the partition date of an Engagement DLO), additive mappings from a source field onto another field (`spec.additiveFieldMappings`; Salesforce reads them back as the source label in `formula` when an update added them, and as a plain source mapping when the create carried them) and formula mappings onto a DLO field (`spec.formulaMappings`). This code means the stream has a mapping of another kind: a plain mapping from a field the event does not have, an additive mapping from a label that several event fields share (the file names a source by its label, so it could not say which one), a mapping onto a field the DLO does not have, or a mapping with both a source field and a formula.

Deploy and delete read the stream the same way, so they stop too.

## Why the plugin stops

Leaving such a mapping out of the file would hide part of the stream. A later deploy could then be compared against an incomplete picture, so the plugin refuses instead.

## How to fix

1. Look at the stream's mappings in Data Cloud Setup.
2. If you need the plugin to manage the stream, change those mappings there.
3. Otherwise manage this stream in Salesforce directly.

## Example output

```text
Retrieve: success.
Warning: data-stream:WebOrders_Order_1a2b3c4d: retrieved as-is (verbatim, reason UNSUPPORTED_STREAM_PROJECTION) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream: 1
```

## Related codes

- [`UNSUPPORTED_STREAM_READ`](../data-stream/UNSUPPORTED_STREAM_READ.md) — the stream itself is outside the supported profile.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
