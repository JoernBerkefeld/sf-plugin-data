# `STREAM_SOURCE_DRIFT`

> The stream's source fields differ from the fields of its connection event. Check the event schema in the org; the stream may need to be refreshed in Salesforce.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The plugin reads the fields of the connection's event and the source fields recorded on the stream, and compares names and types. This code means they differ, for example because the event schema was uploaded again with added or removed fields.

## Why the plugin stops

Mappings refer to source fields. If the stream and the event disagree, the plugin cannot tell which fields a mapping can use, so it stops.

## How to fix

1. Compare the event schema of the connection with the stream's source fields in Data Cloud Setup.
2. Bring them in line in Salesforce.
3. Rerun the command.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: STREAM_SOURCE_DRIFT: Plugin verification failed during connection/stream source field agreement for "WebOrders_Order_1a2b3c4d": sourceFields.length: expected 4; observed 3. Data stream retrieval did not complete; no write attempted.
Hint: The stream's source fields differ from the fields of its connection event. Check the event schema in the org; the stream may need to be refreshed in Salesforce.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_SOURCE_DRIFT.md
Downloaded data-stream: 0
```

## Related codes

- [`INVALID_STREAM_SCHEMA`](../data-stream/INVALID_STREAM_SCHEMA.md) — the event schema is outside the supported profile.
- [`STREAM_BINDING_DRIFT`](../data-stream/STREAM_BINDING_DRIFT.md) — other differences between reads.
