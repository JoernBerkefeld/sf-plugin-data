# `UNSUPPORTED_STREAM_MAPPING_SOURCE`

> A sourceFieldLabel in spec.additiveFieldMappings matches no field of the event, or several. Salesforce would store such a mapping unchecked and it would carry no data. Use the exact label of one source field.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

Each additive mapping names its source by the source field's label, as shown in the connection's event schema. This code means the label matched no field of the event, or more than one. The check runs for a new stream and for an update.

A mapping cannot add a source field: the field must already exist in the event schema.

## Why the plugin stops

Salesforce accepts an additive mapping with a label that names no field without checking it (live, API 68): it stores the label as the mapping and creates the landing field, but the field never receives data. The plugin refuses before that happens, so a typo does not leave a dead field on the DLO.

## How to fix

1. Look up the event's fields and labels in Data Cloud Setup, or in `observed.sourceFields` of a freshly retrieved file.
2. Set `sourceFieldLabel` to the exact label of one source field.
3. If the field does not exist yet, add it to the event schema in Salesforce first.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
UNSUPPORTED_STREAM_MAPPING_SOURCE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: A sourceFieldLabel in spec.additiveFieldMappings matches no field of the event, or several. Salesforce would store such a mapping unchecked and it would carry no data. Use the exact label of one source field.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_MAPPING_SOURCE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_STREAM_MAPPING`](../data-stream/INVALID_STREAM_MAPPING.md) — the mapping entry is invalid.
- [`STREAM_HTTP_ERROR`](../data-stream/STREAM_HTTP_ERROR.md) — Salesforce refused the mapping.
