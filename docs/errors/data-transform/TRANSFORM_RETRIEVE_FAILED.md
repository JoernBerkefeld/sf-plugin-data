# `TRANSFORM_RETRIEVE_FAILED`

> The data transform could not be retrieved because of an error the plugin does not classify, such as an HTTP error. Read the message, check the name and your org login, then rerun.

|              |                                           |
| ------------ | ----------------------------------------- |
| **Family**   | Data transform                            |
| **Commands** | `sf data360 retrieve`                     |
| **Outcome**  | `failed` — nothing in the org was changed |

## What it means

Reading the transform or its schedule from the org failed with an error that is not one of the specific transform checks. Most often this is an HTTP error from Salesforce: the name does not exist (404), the login expired (401), or the user lacks permission (403). The message shows the HTTP status and Salesforce error detail when there is one.

## Why the plugin stops

A failed read is never treated as an empty or missing transform. The plugin stops for this transform and reports the error instead of writing an incomplete file.

## How to fix

1. Check the API name in `--metadata data-transform:<Name>` against Data Cloud.
2. Check your login: `sf org display --target-org <alias>`.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: TRANSFORM_RETRIEVE_FAILED: Salesforce API rejected the request (HTTP 404); no response payload is disclosed. Transform retrieval did not complete; no org write attempted.
Hint: The data transform could not be retrieved because of an error the plugin does not classify, such as an HTTP error. Read the message, check the name and your org login, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_RETRIEVE_FAILED.md
Downloaded data-transform: 0
```

## Related codes

- [`INVALID_TRANSFORM_RESPONSE`](../data-transform/INVALID_TRANSFORM_RESPONSE.md) — the read succeeded but returned no usable record.
- [`TRANSFORM_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_IDENTITY_MISMATCH.md) — the read returned a different transform.
