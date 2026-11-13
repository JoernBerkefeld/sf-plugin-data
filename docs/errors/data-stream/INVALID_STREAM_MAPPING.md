# `INVALID_STREAM_MAPPING`

> An entry in spec.additiveFieldMappings is not valid. Use Text targets without __c, not the primary key, each target only once.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

Each entry in `spec.additiveFieldMappings` maps an existing source field (by its label) to a new landing field. This code means one entry broke a rule:

- `targetFieldName` ends in `__c` (write it without the suffix; the plugin adds it),
- `targetFieldName` is the primary key name,
- the same `targetFieldName` appears twice (case does not matter), or
- `targetFieldReturntype` is not `Text`.

## Why the plugin stops

These rules keep an update purely additive: a new Text field fed from a source field. A mapping that targets the primary key or an existing name would change what the stream already does.

## How to fix

1. Open `data360/data-stream/<ApiName>.data-stream-meta.json`.
2. Correct the entry: target name without `__c`, not the primary key, unique, and `"targetFieldReturntype": "Text"`.
3. Run the deploy with `--preview`, then deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
INVALID_STREAM_MAPPING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: An entry in spec.additiveFieldMappings is not valid. Use Text targets without __c, not the primary key, each target only once.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_MAPPING.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_STREAM_MAPPING_TARGET`](../data-stream/UNSUPPORTED_STREAM_MAPPING_TARGET.md) — the target name is reserved or matches a source field.
- [`UNSUPPORTED_STREAM_MAPPING_SOURCE`](../data-stream/UNSUPPORTED_STREAM_MAPPING_SOURCE.md) — the source label does not match one source field.
- [`STREAM_MAPPING_CONFLICT`](../data-stream/STREAM_MAPPING_CONFLICT.md) — the target already exists with a different mapping.
