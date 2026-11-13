# `STREAM_EXISTING_BINDING_REQUIRES_UPDATE`

> A stream already exists for this connection and event, so it cannot be created. Retrieve it, edit the retrieved file, then deploy again.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

Deploy chooses between create and update by looking for a stream on the connection, not by the stream name. This code means the create path found a stream there — usually because one was created between the plugin's first check and the create checks.

## Why the plugin stops

Creating a second stream for the same connection and event would duplicate it. The plugin refuses the create.

## How to fix

1. Retrieve the existing stream: `sf data360 retrieve -m data-stream:<ApiName>`, using its actual name.
2. Make your changes in the retrieved file.
3. Deploy that file.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order; mutation: not-attempted.
STREAM_EXISTING_BINDING_REQUIRES_UPDATE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: A stream already exists for this connection and event, so it cannot be created. Retrieve it, edit the retrieved file, then deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_EXISTING_BINDING_REQUIRES_UPDATE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`STREAM_UPDATE_TARGET_ABSENT`](../data-stream/STREAM_UPDATE_TARGET_ABSENT.md) — the opposite case: an update found no stream.
- [`AMBIGUOUS_STREAM_BINDING`](../data-stream/AMBIGUOUS_STREAM_BINDING.md) — more than one stream on the connection.
