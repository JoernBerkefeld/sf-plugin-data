# `INVALID_TRANSFORM_RESPONSE`

> Salesforce returned something other than a data transform record when the plugin read it. Nothing was changed; check the transform in Data Cloud and rerun.

|              |                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data transform                                                                                                                                                                             |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                                                                                            |
| **Outcome**  | on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning; `blocked` for deploy and delete — nothing was changed |

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
Retrieve: success.
Warning: data-transform:Orders_Copy: retrieved as-is (verbatim, reason INVALID_TRANSFORM_RESPONSE) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-transform: 1
```

## Related codes

- [`TRANSFORM_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_IDENTITY_MISMATCH.md) — a record came back, but for a different transform.
- [`TRANSFORM_RETRIEVE_FAILED`](../data-transform/TRANSFORM_RETRIEVE_FAILED.md) — the read failed with an HTTP or other error.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
