# `UNSUPPORTED_STREAM_SETTINGS_CHANGE`

> The file changes the stream label, DLO label or primary key of an existing stream, which is not supported. Use the values from a freshly retrieved file.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

For an existing stream, the plugin compares `spec.label`, `spec.newDlo.label` and `spec.newDlo.primaryKey` with the stream in the org. This code means at least one of them differs.

A common cause is deploying a file to another org where the stream and DLO have different labels, or editing the labels by hand.

## Why the plugin stops

Updates only add mappings. The plugin has no supported way to rename a stream or DLO or change its key, and it does not ignore the difference silently.

## How to fix

1. Retrieve the existing stream: `sf data360 retrieve -m data-stream:<ApiName> --overwrite`.
2. Keep the retrieved `label`, `newDlo.label` and `primaryKey`, and only add entries to `spec.additiveFieldMappings`.
3. Change labels in Salesforce if you need to.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
UNSUPPORTED_STREAM_SETTINGS_CHANGE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The file changes the stream label, DLO label or primary key of an existing stream, which is not supported. Use the values from a freshly retrieved file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_SETTINGS_CHANGE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_STREAM_PRIMARY_KEY`](../data-stream/INVALID_STREAM_PRIMARY_KEY.md) — the key does not match the event or DLO.
- [`STREAM_MAPPING_CONFLICT`](../data-stream/STREAM_MAPPING_CONFLICT.md) — an existing mapping differs.
