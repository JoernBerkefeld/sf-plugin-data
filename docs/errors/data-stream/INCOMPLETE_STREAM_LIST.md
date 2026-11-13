# `INCOMPLETE_STREAM_LIST`

> The connection's data stream list could not be read completely, for example because pages repeated or totals changed. Rerun the command; avoid changing streams while it runs.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The plugin lists every data stream of the connection, page by page, to find the stream the file describes. This code means the pages did not add up to one complete list: a stream appeared twice, the count went past the reported total, a page was empty before the end, the next page did not follow on, or the list had more than 20 pages.

## Why the plugin stops

The plugin decides whether a stream exists, and which one it is, from this list. An incomplete list could make it create a duplicate or touch the wrong stream, so it stops.

## How to fix

1. Make sure nobody creates or deletes streams on the same connection while the command runs.
2. Rerun the command.
3. If `mutation` is `unknown`, check the stream in Data Cloud Setup before you rerun a deploy or delete.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INCOMPLETE_STREAM_LIST: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The connection's data stream list could not be read completely, for example because pages repeated or totals changed. Rerun the command; avoid changing streams while it runs.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INCOMPLETE_STREAM_LIST.md
Downloaded data-stream: 0
```

## Related codes

- [`INVALID_STREAM_PAGE`](../data-stream/INVALID_STREAM_PAGE.md) — a page of the same list had an unexpected shape.
- [`INCOMPLETE_CONNECTION_LIST`](../data-stream/INCOMPLETE_CONNECTION_LIST.md) — the same check for the connection list.
