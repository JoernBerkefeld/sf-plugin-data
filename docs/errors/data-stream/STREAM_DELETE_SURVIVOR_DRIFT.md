# `STREAM_DELETE_SURVIVOR_DRIFT`

> A DLO that should stay unchanged by the stream delete changed. This is an internal guard; check that DLO in the org before anything else.

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Family**   | Data stream                                                  |
| **Commands** | None at present — the public commands do not set this guard. |
| **Outcome**  | `failed` — mutation `unknown`                                |

## What it means

The stream delete service can be given other DLOs that must remain unchanged. After the delete it reads each one by name and by ID and compares it with the earlier read. This code means one of them differs.

`sf data360 delete` does not pass such DLOs at present, so you should not see this code from the command line.

## Why the plugin stops

The delete request was already sent. A protected DLO changed, so the plugin reports the result as unknown instead of success.

## How to fix

1. Check the named DLO and the stream in Data Cloud Setup.
2. Report the code together with the command you ran.

## Example output

```text
Delete: failed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
STREAM_DELETE_SURVIVOR_DRIFT: Plugin verification failed during delete survivor preservation for "Orders_Archive__dll": parents.0.status: expected "ACTIVE"; observed "PROCESSING". Deletion outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: A DLO that should stay unchanged by the stream delete changed. This is an internal guard; check that DLO in the org before anything else.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DELETE_SURVIVOR_DRIFT.md
```

## Related codes

- [`INVALID_STREAM_DELETE_SURVIVOR`](../data-stream/INVALID_STREAM_DELETE_SURVIVOR.md) — a protected DLO could not be checked before the delete.
