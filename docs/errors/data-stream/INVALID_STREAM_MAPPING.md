# `INVALID_STREAM_MAPPING`

> An entry in spec.additiveFieldMappings or spec.formulaMappings is not valid. Write target names without __c, and use each target only once.

|              |                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                 |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning |

## What it means

Each entry in `spec.additiveFieldMappings` maps a source field (by its label) onto a landing field, and each entry in `spec.formulaMappings` a formula onto a landing field. This code means one entry broke a rule of the file:

- `targetFieldName` ends in `__c` (write it without the suffix; the plugin adds it), or
- the same `targetFieldName` appears twice across both lists (case does not matter).

Field types, sources and targets are not checked here: they are sent as written and Salesforce decides.

## Why the plugin stops

A target named twice says two different things about one field, and the plugin cannot tell which one you mean. A `__c` suffix would make the plugin look for a field name that does not exist.

## How to fix

1. Open `data360/data-stream/<ApiName>.data-stream-meta.json`.
2. Write each target name without `__c`, and keep one mapping per target.
3. Run the deploy with `--preview`, then deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
INVALID_STREAM_MAPPING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: An entry in spec.additiveFieldMappings or spec.formulaMappings is not valid. Write target names without __c, and use each target only once.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_MAPPING.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_STREAM_MAPPING_SOURCE`](../data-stream/UNSUPPORTED_STREAM_MAPPING_SOURCE.md) — the source label does not match one source field.
- [`STREAM_HTTP_ERROR`](../data-stream/STREAM_HTTP_ERROR.md) — Salesforce refused the mapping.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
