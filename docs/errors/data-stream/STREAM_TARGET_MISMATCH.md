# `STREAM_TARGET_MISMATCH`

> The stream with this name is not the stream found on the connection. Check spec.connectionName and the stream name, then retrieve the stream again.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The plugin reads the stream by the name in the file and also finds the stream on the connection. This code means the two did not match: reading by name returned a different name, the named stream has a different record ID, or it belongs to another connection.

## Why the plugin stops

The plugin would not know which of the two streams to change. Acting on either could change the wrong one, so it stops.

## How to fix

1. Check `identity.apiName` and `spec.connectionName` in the stream file.
2. Look in Data Cloud Setup which stream uses the connection.
3. Retrieve that stream with `sf data360 retrieve -m data-stream:<ApiName>` and deploy the retrieved file.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_TARGET_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The stream with this name is not the stream found on the connection. Check spec.connectionName and the stream name, then retrieve the stream again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_TARGET_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`AMBIGUOUS_STREAM_BINDING`](../data-stream/AMBIGUOUS_STREAM_BINDING.md) — the connection has several streams.
- [`STREAM_BINDING_DRIFT`](../data-stream/STREAM_BINDING_DRIFT.md) — the same stream read differently.
