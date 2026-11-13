# `INVALID_TRANSFORM_RESPONSE`

> Salesforce returned something other than a data transform record when the plugin read it. Nothing was changed; check the transform in Data Cloud and rerun.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The plugin read a data transform by name or ID and the response body was not a JSON object (for example empty, a list, or plain text). Without a record there is nothing the plugin can check or convert into a file.

## Why the plugin stops

Every later step relies on reading fields from the record. The plugin stops instead of treating an unreadable answer as an empty or missing transform.

## How to fix

1. Check in Data Cloud that the transform exists and opens normally.
2. Check that the org is reachable and your login is still valid (`sf org display --target-org <alias>`).
3. Rerun the command.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: INVALID_TRANSFORM_RESPONSE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: Salesforce returned something other than a data transform record when the plugin read it. Nothing was changed; check the transform in Data Cloud and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_RESPONSE.md
Downloaded data-transform: 0
```

## Related codes

- [`TRANSFORM_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_IDENTITY_MISMATCH.md) — a record came back, but for a different transform.
- [`TRANSFORM_RETRIEVE_FAILED`](../data-transform/TRANSFORM_RETRIEVE_FAILED.md) — the read failed with an HTTP or other error.
