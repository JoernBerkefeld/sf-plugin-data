# `INVALID_MAPPING_RESPONSE`

> Salesforce answered a mapping request with a body the plugin could not read as a mapping. Rerun the command; if it repeats, inspect the mapping in the org.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Mapping                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`      |
| **Outcome**  | `blocked` before a write; `failed` with mutation `unknown` after one |

## What it means

A mapping read or write returned a body that is not JSON, not an object, lacks the mapping name or pair list, or (for a list) lacks the list of mappings.

## Why the plugin stops

Without a readable answer the plugin cannot compare the org with your file or confirm a write, so it stops instead of assuming.

## How to fix

1. Rerun the command; a transient service problem can cause this.
2. If it repeats, open the mapping in Data Cloud Setup and check that it exists and is complete.
3. If the error came after a write, inspect the mapping before deploying again.

## Example output

```text
Retrieve: failed.
mapping:Customer_Home_map: INVALID_MAPPING_RESPONSE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: Salesforce answered a mapping request with a body the plugin could not read as a mapping. Rerun the command; if it repeats, inspect the mapping in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_MAPPING_RESPONSE.md
Downloaded mapping: 0
```

## Related codes

- [`MAPPING_REQUEST_UNCONFIRMED`](../mapping/MAPPING_REQUEST_UNCONFIRMED.md) — the answer to a mapping request could not be confirmed.
- [`MAPPING_HTTP_ERROR`](../mapping/MAPPING_HTTP_ERROR.md) — Salesforce answered a mapping request with an HTTP error.
