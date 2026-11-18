# `UNSUPPORTED_STREAM_SETTINGS_CHANGE`

> The file changes what no stream update changes: the refresh mode, DLO label, category, event time field or primary key, or a plain CRM field mapping. Use the values from a freshly retrieved file.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

For an existing Ingestion API stream, the plugin compares `spec.refreshMode`, `spec.newDlo.label`, `spec.newDlo.category`, `spec.newDlo.eventDateTimeFieldName` and `spec.newDlo.primaryKey` with the stream in the org. For an existing stream of another connector (the GET-shaped file), it compares every plain `sourceFieldName` to `targetFieldName` mapping in `spec.mappings`. This code means at least one of them differs; the message names the key paths.

A common cause is deploying a file to another org where the DLO has another label, or editing these values by hand. The stream label itself is sent (Salesforce keeps its own; see [`STREAM_CHANGE_NOT_APPLIED`](../data-stream/STREAM_CHANGE_NOT_APPLIED.md)). Mapping changes of an Ingestion API stream and formula changes are sent, and Salesforce decides.

## Why the plugin stops

Salesforce answers a stream update of the refresh mode (`REPLACE`, `INCREMENTAL`), the DLO label, category or event time field with 200 but changes nothing (live, API 68); a deploy that sent them would report a change that did not happen. The primary key has no write, and a plain mapping cannot be sent (`sourceFieldName` is no update input).

## How to fix

1. Retrieve the existing stream: `sf data360 retrieve -m data-stream:<ApiName> --overwrite`.
2. Keep the retrieved refresh mode, `newDlo` values and plain mappings; change mappings and formulas only.
3. Change the DLO in Salesforce if you need to.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
UNSUPPORTED_STREAM_SETTINGS_CHANGE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The file changes what no stream update changes: the refresh mode, DLO label, category, event time field or primary key, or a plain CRM field mapping. Use the values from a freshly retrieved file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_SETTINGS_CHANGE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_STREAM_PRIMARY_KEY`](../data-stream/INVALID_STREAM_PRIMARY_KEY.md) — the key does not match the event or DLO.
- [`STREAM_CHANGE_NOT_APPLIED`](../data-stream/STREAM_CHANGE_NOT_APPLIED.md) — Salesforce accepted a change but kept the old value.
