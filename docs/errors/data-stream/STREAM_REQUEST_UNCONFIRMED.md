# `STREAM_REQUEST_UNCONFIRMED`

> A stream request did not return a readable HTTP status. For a create, update or delete, the change may have happened; inspect the org, then rerun.

|              |                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                                          |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` for a read before any write — nothing was changed; `failed` with mutation `unknown` for a create, update or delete request |

## What it means

Stream creates and updates run through `sf api request rest`, and reads through the plugin's own client. This code means the plugin could not confirm how a request ended: the CLI call failed, its output had no HTTP status line, it ended with an error, the status was a success other than the expected one (201 for create, 200 for update, 204 for delete), or a read failed with an unexpected error.

## Why the plugin stops

Without a clear status the plugin cannot tell whether Salesforce applied a write. It does not retry, to avoid making the same change twice.

## How to fix

1. Check your network and that `sf` works: `sf org display -o <alias>`.
2. If `mutation` is `unknown`, check the stream in Data Cloud Setup and retrieve it.
3. Rerun the command, with `--preview` first for deploy and delete.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
STREAM_REQUEST_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: A stream request did not return a readable HTTP status. For a create, update or delete, the change may have happened; inspect the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_REQUEST_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`STREAM_HTTP_ERROR`](../data-stream/STREAM_HTTP_ERROR.md) — Salesforce answered with an error status.
- [`INVALID_STREAM_RESPONSE`](../data-stream/INVALID_STREAM_RESPONSE.md) — the status was fine but the body was not readable.
