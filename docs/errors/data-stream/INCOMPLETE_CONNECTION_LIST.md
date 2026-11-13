# `INCOMPLETE_CONNECTION_LIST`

> The list of Ingestion API connections was incomplete or had an unexpected shape. Check the org's connections; the plugin supports fewer than 200 of them.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

To find the stream's connection, the plugin reads the org's Ingestion API connections in one request of up to 200 entries. This code means that answer could not be shown to be the complete list: it had 200 or more entries, it had page details that do not match the request, or it had no connection list at all.

## Why the plugin stops

The plugin decides whether a connection exists, and whether it exists only once, from this list. A partial list could hide a duplicate or the real connection, so it stops.

## How to fix

1. Check how many Ingestion API connections the org has. If there are 200 or more, remove ones that are no longer used.
2. Rerun the command. If it keeps failing with few connections, the API answer has changed shape; report it.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
INCOMPLETE_CONNECTION_LIST: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No deletion attempted; correct the reported check before another attempt.
Hint: The list of Ingestion API connections was incomplete or had an unexpected shape. Check the org's connections; the plugin supports fewer than 200 of them.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INCOMPLETE_CONNECTION_LIST.md
```

## Related codes

- [`AMBIGUOUS_STREAM_CONNECTION`](../data-stream/AMBIGUOUS_STREAM_CONNECTION.md) — the list was complete but the connection was not found exactly once.
- [`INCOMPLETE_STREAM_LIST`](../data-stream/INCOMPLETE_STREAM_LIST.md) — the same check for the stream list.
