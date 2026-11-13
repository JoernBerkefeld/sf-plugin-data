# `RELATIONSHIP_REQUEST_UNCONFIRMED`

> A relationship request ended without a clear HTTP result. For a create or delete, list the source DMO's relationships before trying again; nothing is retried.

|              |                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| **Family**   | Relationship                                                                                           |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                        |
| **Outcome**  | `failed` with mutation `unknown` after a create or delete; otherwise `failed` on retrieve or `blocked` |

## What it means

A relationship request finished, but the plugin could not read a clear result: the CLI output had no HTTP status line, the CLI exited with an error despite a success status, the status was a success code the plugin does not expect for that request, or the connection failed without an HTTP status.

## Why the plugin stops

For a create or delete the request may have taken effect. The plugin reports the outcome as unknown and does not send it again.

## How to fix

1. Check that Salesforce CLI works: `sf org display -o <alias>`.
2. For a create or delete, preview the same command to see the current state.
3. Rerun the command.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: unknown.
RELATIONSHIP_REQUEST_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; list the source DMO relationships before another attempt. No automatic retry.
Hint: A relationship request ended without a clear HTTP result. For a create or delete, list the source DMO's relationships before trying again; nothing is retried.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_REQUEST_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`RELATIONSHIP_HTTP_ERROR`](../relationship/RELATIONSHIP_HTTP_ERROR.md) — The request returned an HTTP error.
