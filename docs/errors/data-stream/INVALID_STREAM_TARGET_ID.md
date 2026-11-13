# `INVALID_STREAM_TARGET_ID`

> The stream record ID or delete option for an update or delete request was not valid. Nothing was sent; rerun the command and report it if it happens again.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data stream                              |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

Stream updates and deletes address the stream by its 18-character record ID, which the plugin takes from its own reads. A delete also needs a true or false value for deleting the linked DLO. This code means the ID or that value was not valid just before the request.

The plugin's checks normally rule this out, so it points to an internal inconsistency.

## Why the plugin stops

The ID goes into the request path. An invalid ID could address the wrong record, so the plugin does not send the request.

## How to fix

1. Rerun the command with `--preview` first.
2. If the code appears again, report it with the command you ran.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
INVALID_STREAM_TARGET_ID: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No deletion attempted; correct the reported check before another attempt.
Hint: The stream record ID or delete option for an update or delete request was not valid. Nothing was sent; rerun the command and report it if it happens again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_TARGET_ID.md
```

## Related codes

- [`STREAM_TARGET_MISMATCH`](../data-stream/STREAM_TARGET_MISMATCH.md) — the stream found by name differs from the one found on the connection.
