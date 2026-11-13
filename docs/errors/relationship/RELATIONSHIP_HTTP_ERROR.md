# `RELATIONSHIP_HTTP_ERROR`

> Salesforce rejected a relationship request with an HTTP error. Read the status and API detail in the message; for a create, both DMOs must already be mapped.

|              |                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| **Family**   | Relationship                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                |
| **Outcome**  | `failed` with mutation `rejected` for a rejected create or delete; otherwise `failed` on retrieve or `blocked` |

## What it means

A relationship list, create or delete request returned an HTTP status outside 200–299. The message shows the status and, when Salesforce sent one, its error code and text.

A frequent case on create is HTTP 400 because one of the two DMOs has no mapping yet. A 4xx answer to a create or delete means nothing was written.

## Why the plugin stops

The plugin reports Salesforce's answer as is and does not retry. It does not check mappings itself; Salesforce decides.

## How to fix

1. Read the status and API detail in the message.
2. For a create: deploy mappings for both DMOs first, or in the same batch.
3. For 401 or 403: log in again with `sf org login web` or check permissions.
4. For 5xx: wait and rerun; check the org before repeating a write.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: rejected.
RELATIONSHIP_HTTP_ERROR: Salesforce API rejected the request (HTTP 400); no response payload is disclosed. Salesforce rejected the write and nothing was written for this item; correct the input before another attempt.
Hint: Salesforce rejected a relationship request with an HTTP error. Read the status and API detail in the message; for a create, both DMOs must already be mapped.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_HTTP_ERROR.md
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`RELATIONSHIP_REQUEST_UNCONFIRMED`](../relationship/RELATIONSHIP_REQUEST_UNCONFIRMED.md) — The request ended without a clear HTTP status.
