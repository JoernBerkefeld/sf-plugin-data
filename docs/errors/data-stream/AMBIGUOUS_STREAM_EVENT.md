# `AMBIGUOUS_STREAM_EVENT`

> The stream could not be tied to exactly one event of its connection: the connection has no event, names one twice, or several events fit the stream. Retrieve wrote the stream as-is.

|              |                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                 |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning |

## What it means

An Ingestion API connection carries an uploaded schema with one or more events (objects), and each event can feed one data stream. The stream read does not name its event, so the plugin ties a stream to its event: a connection with one event needs no match; otherwise the event is the one the generated stream name (`<connection>_<event>_<hash>`) or label (`<connection>-<event>`) names, and when several fit, the one whose fields equal the stream's source fields.

This code means that did not lead to exactly one event: the connection has no event, its schema names an event twice, or several events (or none) fit the stream.

## Why the plugin stops

Tied to the wrong event, the plugin would compare the wrong source fields or change the wrong stream, so it writes the stream as-is on retrieve and stops on deploy and delete.

## How to fix

1. Open the connection in Data Cloud Setup and look at its uploaded schema and its streams.
2. If it has no event, upload the schema for the event the stream uses.
3. If the stream was renamed or relabelled so that it names no event, or several events have the same fields and fit the stream, manage that stream in Salesforce.
4. Rerun the command.

## Example output

```text
Retrieve: success.
Warning: data-stream:WebOrders_Order_1a2b3c4d: retrieved as-is (verbatim, reason AMBIGUOUS_STREAM_EVENT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream: 1
```

## Related codes

- [`INVALID_STREAM_SCHEMA`](../data-stream/INVALID_STREAM_SCHEMA.md) — the event exists but does not match.
- [`AMBIGUOUS_STREAM_BINDING`](../data-stream/AMBIGUOUS_STREAM_BINDING.md) — several streams read the same event.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
