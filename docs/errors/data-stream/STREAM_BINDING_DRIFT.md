# `STREAM_BINDING_DRIFT`

> The stream, its event or its connection changed between two reads, or reads disagreed. Wait until nobody changes the stream, then rerun; inspect the org first if mutation is unknown.

|              |                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                 |
| **Outcome**  | `blocked` before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The plugin reads the same stream in more than one way — from the connection's stream list, by name and by record ID — and repeats its checks just before a write. This code means those reads did not agree. The message names the check and the first difference, for example:

- the event says `In Use` but no stream was found, or `Available` while a stream exists,
- the stream list and the stream read differ,
- the plan made before the write differs from the fresh plan,
- after a create, update or delete, the read-back of the stream differs from what was expected.

## Why the plugin stops

A difference between reads means something else is changing the stream, or the org has not finished an earlier change. Writing on top of that could overwrite another change or touch the wrong stream, so the plugin stops.

## How to fix

1. Read the difference in the message.
2. Make sure no other user, job or deploy changes the stream or its connection.
3. If `mutation` is `unknown`, check the stream in Data Cloud Setup, then retrieve it to see its state.
4. Rerun the command when the stream is stable.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_BINDING_DRIFT: Plugin verification failed during resolve existing stream event availability for "WebOrders_Order_1a2b3c4d": event.availabilityStatus: expected "In Use"; observed "Available". No write attempted; correct the reported check before another attempt.
Hint: The stream, its event or its connection changed between two reads, or reads disagreed. Wait until nobody changes the stream, then rerun; inspect the org first if mutation is unknown.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_BINDING_DRIFT.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`STREAM_SNAPSHOT_PENDING`](../data-stream/STREAM_SNAPSHOT_PENDING.md) — only the processing status changed between reads.
- [`STREAM_SOURCE_DRIFT`](../data-stream/STREAM_SOURCE_DRIFT.md) — the event's fields and the stream's source fields differ.
- [`STREAM_DELETE_GUARD_DRIFT`](../data-stream/STREAM_DELETE_GUARD_DRIFT.md) — the delete counterpart.
