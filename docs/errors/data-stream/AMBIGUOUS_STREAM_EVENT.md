# `AMBIGUOUS_STREAM_EVENT`

> The connection does not have exactly one uploaded event schema. Use a connection whose schema holds only the event named in spec.event.

|              |                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                 |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning |

## What it means

An Ingestion API connection carries an uploaded schema with one or more events (objects). The plugin reads that schema to find the event named in `spec.event` and its source fields.

This code means the schema has no event at all or more than one event. The plugin only supports connections with exactly one event.

## Why the plugin stops

The stream read does not say which event it uses. With several events on one connection the plugin cannot tie a stream to its event, so it could compare the wrong source fields or change the wrong stream.

## How to fix

1. Open the connection in Data Cloud Setup and look at its uploaded schema.
2. If it has no event, upload the schema for the event the stream uses.
3. If it has several events, use a separate connection that carries only the event this stream needs.
4. Rerun the command.

## Example output

```text
Retrieve: success.
Warning: data-stream:WebOrders_Order_1a2b3c4d: retrieved as-is (verbatim, reason AMBIGUOUS_STREAM_EVENT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream: 1
```

## Related codes

- [`INVALID_STREAM_SCHEMA`](../data-stream/INVALID_STREAM_SCHEMA.md) — the single event exists but does not match.
- [`AMBIGUOUS_STREAM_CONNECTION`](../data-stream/AMBIGUOUS_STREAM_CONNECTION.md) — the connection itself could not be identified.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
