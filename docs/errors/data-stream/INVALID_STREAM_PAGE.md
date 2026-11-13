# `INVALID_STREAM_PAGE`

> A page of the connection's data stream list had an unexpected shape or page link. Rerun the command; report it if it keeps happening.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The plugin lists the connection's data streams in pages of 200. Each page must have only the known keys, a stream list of at most 200 entries, a stable total, and page links that point back to the same list with the same filters and an expected offset. Each entry must have a valid name, an 18-character record ID and the selected connection as its data source.

This code means a page broke one of those rules.

## Why the plugin stops

A page link that changes the filters, or an entry from another connection, could make the list look complete when it is not. The plugin decides whether a stream exists from this list, so it stops.

## How to fix

1. Rerun the command.
2. If it keeps happening, the API answer has changed; report it with the API version used.
3. If `mutation` is `unknown`, check the stream in Data Cloud Setup before you rerun a deploy or delete.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_PAGE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: A page of the connection's data stream list had an unexpected shape or page link. Rerun the command; report it if it keeps happening.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_PAGE.md
Downloaded data-stream: 0
```

## Related codes

- [`INCOMPLETE_STREAM_LIST`](../data-stream/INCOMPLETE_STREAM_LIST.md) — the pages did not add up to a complete list.
