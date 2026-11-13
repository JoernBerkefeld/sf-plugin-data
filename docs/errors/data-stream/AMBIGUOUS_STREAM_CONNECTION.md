# `AMBIGUOUS_STREAM_CONNECTION`

> The Ingestion API connection could not be identified exactly once in the org. Check that spec.connectionName names one existing connection, then rerun.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

The plugin reads the org's list of Ingestion API connections and looks for the one named in `spec.connectionName` (on retrieve and delete: the data source of the stream). This code means that name matched no connection or more than one, or the list held an entry the plugin could not read (missing name or ID, a different connector type, or a name or ID that appears twice).

The most common cause is deploying to another org where the connection has a different developer name or does not exist yet.

## Why the plugin stops

Every later check, and the stream request itself, depends on knowing exactly which connection the stream uses. Without one clear match, the plugin cannot prove what it would change.

## How to fix

1. In the target org, open Data Cloud Setup and find the Ingestion API connection the stream should use.
2. Set `spec.connectionName` in `data360/data-stream/<ApiName>.data-stream-meta.json` to that connection's exact developer name. If it does not exist yet, create it and upload its event schema first.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
AMBIGUOUS_STREAM_CONNECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The Ingestion API connection could not be identified exactly once in the org. Check that spec.connectionName names one existing connection, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/AMBIGUOUS_STREAM_CONNECTION.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INCOMPLETE_CONNECTION_LIST`](../data-stream/INCOMPLETE_CONNECTION_LIST.md) — the connection list itself was not complete.
- [`STREAM_CONNECTION_MISMATCH`](../data-stream/STREAM_CONNECTION_MISMATCH.md) — the connection was found but its details do not match.
- [`AMBIGUOUS_STREAM_EVENT`](../data-stream/AMBIGUOUS_STREAM_EVENT.md) — the next check, on the connection's events.
