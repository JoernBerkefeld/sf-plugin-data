# `INVALID_STREAM_DELETE_SURVIVOR`

> A DLO that should stay after the stream delete could not be checked. This is an internal guard; rerun the delete and report it if it happens again.

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Family**   | Data stream                                                  |
| **Commands** | None at present — the public commands do not set this guard. |
| **Outcome**  | `blocked` — nothing was changed                              |

## What it means

The stream delete service can be given a list of other DLOs that must remain unchanged by the delete. It checks each one before the delete: a valid `__dll` name, not the stream's own DLO, listed once, found exactly once, and active.

This code means one of those DLOs failed that check. `sf data360 delete` does not pass such a list at present, so you should not see this code from the command line.

## Why the plugin stops

The plugin only deletes when it can compare every protected DLO before and after. A DLO it cannot read cleanly cannot be protected, so it stops.

## How to fix

1. Rerun the delete.
2. If the code appears, report it together with the command you ran.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
INVALID_STREAM_DELETE_SURVIVOR: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No deletion attempted; correct the reported check before another attempt.
Hint: A DLO that should stay after the stream delete could not be checked. This is an internal guard; rerun the delete and report it if it happens again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_DELETE_SURVIVOR.md
```

## Related codes

- [`STREAM_DELETE_SURVIVOR_DRIFT`](../data-stream/STREAM_DELETE_SURVIVOR_DRIFT.md) — a protected DLO changed during the delete.
