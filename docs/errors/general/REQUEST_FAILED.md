# `REQUEST_FAILED`

> Salesforce rejected or did not complete a request. Read the HTTP status and request ID in the message, fix the cause such as permissions, a missing object or limits, then rerun.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | General                                                                      |
| **Commands** | `sf data360 retrieve`                                                        |
| **Outcome**  | `failed` — the affected component was not retrieved; the org was not changed |

## What it means

A request to the Data Cloud API failed with an HTTP error other than an authentication error, or a call that should answer with an empty success did not. The message shows the HTTP status, any error code and message Salesforce returned, and the request ID. HTTP 429 and 503 are described as possible rate limits.

The plugin does not print response bodies.

## Why the plugin stops

The plugin has no data to work with for this component and never retries a request on its own.

## How to fix

1. Read the HTTP status: 403 usually means missing permissions, 404 a missing object, 429 or 503 a rate limit or service issue.
2. Fix the cause in the org or wait for limits to reset.
3. Rerun the command. Quote the request ID if you contact Salesforce support.

## Example output

```text
Retrieve: failed.
calculated-insight:Lifetime_Value__cio: REQUEST_FAILED: Salesforce API rejected the request (HTTP 403); no response payload is disclosed. Salesforce API detail: INSUFFICIENT_ACCESS: insufficient access rights on object id; Request ID: 4b1f0c2e-0000-0000-0000-000000000000. This component was not retrieved; no files were written for it.
Hint: Salesforce rejected or did not complete a request. Read the HTTP status and request ID in the message, fix the cause such as permissions, a missing object or limits, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/REQUEST_FAILED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`AUTHENTICATION_FAILED`](../general/AUTHENTICATION_FAILED.md) — the request failed because the session was rejected.
- [`INVALID_REQUEST`](../general/INVALID_REQUEST.md) — the plugin refused the request before sending it.
