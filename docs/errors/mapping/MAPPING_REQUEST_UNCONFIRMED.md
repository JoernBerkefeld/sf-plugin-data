# `MAPPING_REQUEST_UNCONFIRMED`

> The plugin could not confirm how Salesforce answered a mapping request. Inspect the mapping in the org before running the command again; nothing was retried.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Mapping                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`      |
| **Outcome**  | `blocked` before a write; `failed` with mutation `unknown` after one |

## What it means

A mapping request finished without a usable answer: no HTTP status was received, the Salesforce CLI call failed, the status was a success code not expected for that request, a read returned no content, or the request ended with an unexpected error.

## Why the plugin stops

If the request was a write, it may or may not have taken effect. Sending it again could apply it twice, so the plugin stops and does not retry.

## How to fix

1. Check your network and the target org login.
2. Retrieve the mapping to see its current state.
3. Run the command again with `--preview` before executing.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: mapping:Customer_Home_map; mutation: unknown.
MAPPING_REQUEST_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The plugin could not confirm how Salesforce answered a mapping request. Inspect the mapping in the org before running the command again; nothing was retried.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_REQUEST_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`MAPPING_HTTP_ERROR`](../mapping/MAPPING_HTTP_ERROR.md) — Salesforce answered a mapping request with an HTTP error.
- [`INVALID_MAPPING_RESPONSE`](../mapping/INVALID_MAPPING_RESPONSE.md) — Salesforce answered with a body that is not a mapping.
