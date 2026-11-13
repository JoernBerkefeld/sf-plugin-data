# `MAPPING_HTTP_ERROR`

> Salesforce rejected a mapping request with an HTTP error. Read the status and API detail in the message, fix the cause (name, access, org state), then rerun.

|              |                                                                                    |
| ------------ | ---------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                            |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                    |
| **Outcome**  | `blocked` before a write; `failed` with mutation `rejected` or `unknown` after one |

## What it means

Salesforce answered a mapping read, create, update or pair removal with a status outside 200–299. The message shows the status and the API error detail. A 404 when looking up whether a mapping exists is expected and handled; you see this code only when the error cannot be explained that way, for example when the mapping you selected for retrieve or delete does not exist.

## Why the plugin stops

An error answer means the request did not do what was planned. The plugin reports it and does not retry, so that a write is never sent twice.

## How to fix

1. Read the HTTP status and API detail in the message.
2. For 404, check the mapping name and that it exists in the selected data space.
3. For 401 or 403, check the target org login and your permissions.
4. For 400, correct the mapping file as the API detail says.
5. If the error came after a write, inspect the mapping before running again.

## Example output

```text
Delete: blocked.
Blocked: mapping:Customer_Home_map; mutation: not-attempted.
MAPPING_HTTP_ERROR: Salesforce API rejected the request (HTTP 404); no response payload is disclosed. Salesforce API detail: NOT_FOUND: The requested resource does not exist. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: Salesforce rejected a mapping request with an HTTP error. Read the status and API detail in the message, fix the cause (name, access, org state), then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_HTTP_ERROR.md
```

## Related codes

- [`MAPPING_REQUEST_UNCONFIRMED`](../mapping/MAPPING_REQUEST_UNCONFIRMED.md) — the answer to a mapping request could not be confirmed.
- [`INVALID_MAPPING_RESPONSE`](../mapping/INVALID_MAPPING_RESPONSE.md) — Salesforce answered with a body that is not a mapping.
