# `STREAM_UPDATE_PRESERVATION_FAILED`

> After the stream update, settings, mappings or DLO fields outside the requested additions changed. Inspect the stream and its DLO in the org before anything else.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

A stream update only adds mappings and their new DLO fields. After the update, the plugin compares the stream, its DLO field list and the DLO with the state before the update. Everything except the status and the requested new mappings and fields must be the same, and every earlier mapping and field must still be there.

This code means something else changed or went missing.

## Why the plugin stops

The update was sent and changed more than requested, or something else changed the stream at the same time. The plugin does not try to undo it.

## How to fix

1. Retrieve the stream and compare the file with your previous version (for example with `git diff`).
2. Check the DLO and its fields in Data Cloud Setup.
3. Correct the stream in Salesforce if needed before you deploy again.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
STREAM_UPDATE_PRESERVATION_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: After the stream update, settings, mappings or DLO fields outside the requested additions changed. Inspect the stream and its DLO in the org before anything else.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_UPDATE_PRESERVATION_FAILED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`STREAM_UPDATE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_UPDATE_SETTLEMENT_UNCONFIRMED.md) — the update did not settle in time.
- [`STREAM_BINDING_DRIFT`](../data-stream/STREAM_BINDING_DRIFT.md) — reads after the update disagreed.
