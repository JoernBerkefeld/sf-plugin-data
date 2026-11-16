# `UNSUPPORTED_STREAM_SETTINGS_CHANGE`

> The file changes what no known stream update can change: the DLO label, category, event time field or primary key, a plain field mapping, or the return type of an existing formula. Use the values from a freshly retrieved file.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

For an existing Ingestion API stream, the plugin compares `spec.newDlo.label`, `spec.newDlo.category`, `spec.newDlo.eventDateTimeFieldName`, `spec.newDlo.primaryKey` and the `targetFieldReturntype` of each formula whose target already exists with the stream in the org. For an existing CRM-connector stream, it compares every plain `sourceFieldName` to `targetFieldName` mapping in `spec.mappings` and the return type of each existing formula target. This code means at least one of them differs; the message names the key paths.

A common cause is deploying a file to another org where the DLO has another label, or editing these values by hand. The stream label itself is sent (Salesforce keeps its own; see [`STREAM_CHANGE_NOT_APPLIED`](../data-stream/STREAM_CHANGE_NOT_APPLIED.md)).

## Why the plugin stops

These are settings of the landing DLO, which a stream update does not carry, or mapping changes no proven stream update makes. The plugin has no way to send them and does not ignore the difference silently.

## How to fix

1. Retrieve the existing stream: `sf data360 retrieve -m data-stream:<ApiName> --overwrite`.
2. Keep the retrieved `newDlo` values, plain mappings and formula return types; change formulas only.
3. Change the DLO in Salesforce if you need to.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
UNSUPPORTED_STREAM_SETTINGS_CHANGE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The file changes what no known stream update can change: the DLO label, category, event time field or primary key, a plain field mapping, or the return type of an existing formula. Use the values from a freshly retrieved file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_SETTINGS_CHANGE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_STREAM_PRIMARY_KEY`](../data-stream/INVALID_STREAM_PRIMARY_KEY.md) — the key does not match the event or DLO.
- [`STREAM_MAPPING_CONFLICT`](../data-stream/STREAM_MAPPING_CONFLICT.md) — an existing mapping differs.
