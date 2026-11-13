# `DLO_HTTP_ERROR`

> Salesforce answered a DLO request with an HTTP error. Read the status and API detail in the message, fix access, name or input, then rerun.

|              |                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                                                           |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                            |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `rejected` when Salesforce refused a create, update or delete |

## What it means

A request to the data lake object API returned a status outside the 2xx range. The message gives the HTTP status and, where Salesforce sent one, its error code and text plus a request ID.

Common cases:

- **404** on a read: no DLO with that exact name exists. On deploy this is how the plugin learns the DLO is absent and creates it; on delete it reports the item `unchanged`. Elsewhere, for example on retrieve, it stops.
- **401/403**: the session expired or the user lacks permission.
- **400** on a write: Salesforce did not accept the definition.
- **429/503**: rate limiting or a temporary outage; the message says so.

## Why the plugin stops

The plugin sends each request once and never retries a write on its own. An HTTP error from a read means it cannot confirm what is in the org; an HTTP error from a write is Salesforce's own refusal, and the plugin reports it unchanged.

## How to fix

1. Read the HTTP status and the "Salesforce API detail" part of the message.
2. For 401/403, refresh the login of `--target-org` or grant the missing permission.
3. For 404, check the exact API name (`<Name>__dll`) and the target org.
4. For 400 on a write, correct the `.dlo-meta.json` file as the API detail describes.
5. For 429/503, wait, then rerun.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: dlo:Orders__dll; mutation: rejected.
DLO_HTTP_ERROR: Salesforce API rejected the request (HTTP 400); no response payload is disclosed. Salesforce API detail: INVALID_INPUT: Field length is out of range; Request ID: 0Ab1c2D3e4F5. Salesforce rejected the write and nothing was written for this item; correct the input before another attempt.
Hint: Salesforce answered a DLO request with an HTTP error. Read the status and API detail in the message, fix access, name or input, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_HTTP_ERROR.md
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`DLO_REQUEST_UNCONFIRMED`](../dlo/DLO_REQUEST_UNCONFIRMED.md) — no HTTP status could be read at all.
- [`DMO_HTTP_ERROR`](../dmo/DMO_HTTP_ERROR.md) — the same for data model object requests.
