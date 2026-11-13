# `UNSUPPORTED_STREAM_MAPPING_SOURCE`

> A sourceFieldLabel in spec.additiveFieldMappings matches no source field, several fields, or the primary key. Use the exact label of one non-key source field.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

Each new mapping names its source by the source field's label, as shown in the connection's event schema. This code means the label matched no field, matched more than one field, or matched the primary key field.

A mapping cannot add a source field: the field must already exist in the event schema.

## Why the plugin stops

The plugin must know exactly which source field feeds the new landing field. The primary key is already mapped and cannot be mapped again.

## How to fix

1. Look up the event's fields and labels in Data Cloud Setup, or in `observed.sourceFields` of a freshly retrieved file.
2. Set `sourceFieldLabel` to the exact label of one non-key field.
3. If the field does not exist yet, add it to the event schema in Salesforce first.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
UNSUPPORTED_STREAM_MAPPING_SOURCE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: A sourceFieldLabel in spec.additiveFieldMappings matches no source field, several fields, or the primary key. Use the exact label of one non-key source field.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_MAPPING_SOURCE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_STREAM_MAPPING_TARGET`](../data-stream/UNSUPPORTED_STREAM_MAPPING_TARGET.md) — the target side of the same mapping.
- [`INVALID_STREAM_MAPPING`](../data-stream/INVALID_STREAM_MAPPING.md) — the mapping entry is invalid.
