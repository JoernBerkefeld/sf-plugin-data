# `STREAM_NOT_READY`

> The stream or its DLO is not ACTIVE, for example still processing. Wait until both show ACTIVE in the org, then rerun.

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                       |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                                                   |

## What it means

Updates and deletes require the stream and its linked DLO to have the status `ACTIVE`. This code means one of them had another status, such as `PROCESSING` after a recent change, or an error status.

## Why the plugin stops

Changing a stream while Salesforce is still processing it can clash with that work. The plugin waits for a stable state rather than writing on top of it.

## How to fix

1. Check the stream and its DLO in Data Cloud Setup.
2. Wait until both are active. If one shows an error, fix that in Salesforce first.
3. Rerun the command.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_NOT_READY: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No deletion attempted; correct the reported check before another attempt.
Hint: The stream or its DLO is not ACTIVE, for example still processing. Wait until both show ACTIVE in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_NOT_READY.md
```

## Related codes

- [`STREAM_SNAPSHOT_PENDING`](../data-stream/STREAM_SNAPSHOT_PENDING.md) — the status changed between two reads.
