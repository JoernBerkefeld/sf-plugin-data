# `STREAM_MAPPING_CONFLICT`

> A target field in spec.additiveFieldMappings already exists on the stream with a different source, type or mapping. Use a new target name, or match the existing mapping exactly.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

For each requested mapping, the plugin looks for the target field on the stream's DLO and among the stream's mappings. If it exists, it must be exactly one Text, non-key field with the same name, mapped once from the same source label. Then the mapping is already there and is skipped.

This code means the target exists but differs: another source, another type, the primary key, a different case of the name, or more than one entry.

## Why the plugin stops

Updates only add mappings. Changing an existing mapping would change data already flowing into the DLO, which the plugin does not support.

## How to fix

1. Retrieve the stream to see its current mappings.
2. Choose a new `targetFieldName` that does not exist yet, or change the entry to match the existing mapping exactly.
3. Run the deploy with `--preview`, then deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_MAPPING_CONFLICT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: A target field in spec.additiveFieldMappings already exists on the stream with a different source, type or mapping. Use a new target name, or match the existing mapping exactly.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_MAPPING_CONFLICT.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_STREAM_MAPPING`](../data-stream/INVALID_STREAM_MAPPING.md) — the mapping entry itself is invalid.
- [`UNSUPPORTED_STREAM_MAPPING_TARGET`](../data-stream/UNSUPPORTED_STREAM_MAPPING_TARGET.md) — the target name is reserved.
