# `INVALID_STREAM_SCHEMA`

> The connection's event does not match the stream: no event of that name, unsupported availability, or fields without a type or label, or named twice. Check spec.event and the schema.

|              |                                                                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                                                                                                            |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                                                                                               |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The plugin reads the event named in `spec.event` from the stream's connection schema. This code means that event does not fit:

- the schema has no event of that name,
- its schema type is not Ingestion API,
- its availability is neither `Available` nor `In Use`,
- it has no fields, or
- a field has no type or label, or appears twice.

## Why the plugin stops

The plugin compares the event fields with the stream and sends their types on create. A schema it cannot read that way could lead to mappings the plugin cannot check, so it stops.

## How to fix

1. Open the connection's schema in Data Cloud Setup and check the event name and its fields.
2. Set `spec.event` to the exact event name.
3. Give every field a name, label and type, each name once, then rerun.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
INVALID_STREAM_SCHEMA: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The connection's event does not match the stream: no event of that name, unsupported availability, or fields without a type or label, or named twice. Check spec.event and the schema.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_SCHEMA.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`AMBIGUOUS_STREAM_EVENT`](../data-stream/AMBIGUOUS_STREAM_EVENT.md) — the connection has no event or several.
- [`STREAM_SOURCE_DRIFT`](../data-stream/STREAM_SOURCE_DRIFT.md) — the event fields differ from the stream's source fields.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
