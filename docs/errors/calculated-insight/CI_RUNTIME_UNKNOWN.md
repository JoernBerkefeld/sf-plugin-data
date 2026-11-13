# `CI_RUNTIME_UNKNOWN`

> The calculated insight could not be read from the org, and the answer was not a clear not-found. Check access and the API name, then rerun.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                    |
| **Commands** | `sf data360 retrieve`; also checked by `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                                            |

## What it means

The native Data 360 read of the calculated insight failed with an error other than a plain not-found (HTTP 404 `ITEM_NOT_FOUND`). The message carries the Salesforce detail when there is one.

## Why the plugin stops

Only a clear not-found counts as absent. Any other error leaves the state of the calculated insight unknown.

## How to fix

1. Read the Salesforce detail in the message.
2. Check that the user can access Data 360 and calculated insights.
3. For HTTP 429 or 503, wait and rerun later.
4. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_RUNTIME_UNKNOWN: The calculated insight could not be read; no files were written.
Hint: The calculated insight could not be read from the org, and the answer was not a clear not-found. Check access and the API name, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_RUNTIME_UNKNOWN.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_ACQUISITION_FAILED`](../calculated-insight/CI_ACQUISITION_FAILED.md) — the read stopped for another reason.
