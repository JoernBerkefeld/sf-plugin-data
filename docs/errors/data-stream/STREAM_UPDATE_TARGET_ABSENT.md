# `STREAM_UPDATE_TARGET_ABSENT`

> The stream to update was no longer found on the connection. Check whether it was deleted, then rerun the deploy with --preview.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

Deploy first found a stream on the connection and chose an update. When it ran the update checks, it found no stream there anymore — usually because the stream was deleted in between.

## Why the plugin stops

The update plan was made for a stream that is now gone. The plugin does not switch to a create on its own.

## How to fix

1. Check the connection's streams in Data Cloud Setup.
2. Rerun the deploy with `--preview` to see whether it now plans a create.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_UPDATE_TARGET_ABSENT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The stream to update was no longer found on the connection. Check whether it was deleted, then rerun the deploy with --preview.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_UPDATE_TARGET_ABSENT.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`STREAM_EXISTING_BINDING_REQUIRES_UPDATE`](../data-stream/STREAM_EXISTING_BINDING_REQUIRES_UPDATE.md) — the opposite case: a create found a stream.
