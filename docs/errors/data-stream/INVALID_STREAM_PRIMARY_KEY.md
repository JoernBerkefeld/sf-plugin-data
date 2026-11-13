# `INVALID_STREAM_PRIMARY_KEY`

> The primary key does not match: it must be one Text source field of the event, and the only key field of the DLO. Check spec.newDlo.primaryKey against the org.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

An Ingestion API stream uses one source field of the event as its primary key. This code means one of these checks failed:

- `spec.newDlo.primaryKey.name` is not a field of the connection's event,
- for a new stream, `spec.newDlo.primaryKey.label` differs from that source field's label,
- the existing stream's DLO does not have exactly one primary key field, or that field has a different name or is not Text.

## Why the plugin stops

The primary key decides how incoming records are matched. The plugin does not change it and does not guess it, so it stops when the key cannot be confirmed.

## How to fix

1. Open the connection's event schema in Data Cloud Setup and find the key field.
2. Set `spec.newDlo.primaryKey.name` and `.label` to that field's exact name and label, with `"dataType": "Text"`.
3. For an existing stream, retrieve it again to pick up its actual key, then deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
INVALID_STREAM_PRIMARY_KEY: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The primary key does not match: it must be one Text source field of the event, and the only key field of the DLO. Check spec.newDlo.primaryKey against the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_PRIMARY_KEY.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_STREAM_SCHEMA`](../data-stream/INVALID_STREAM_SCHEMA.md) — the event schema itself does not match.
- [`UNSUPPORTED_STREAM_SETTINGS_CHANGE`](../data-stream/UNSUPPORTED_STREAM_SETTINGS_CHANGE.md) — the key differs from an existing stream.
