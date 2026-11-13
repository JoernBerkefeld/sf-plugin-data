# `CI_ACQUISITION_FAILED`

> The calculated insight could not be read and checked in the target org. Check access to the org and the API name, then rerun the retrieve.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Calculated insight                                            |
| **Commands** | `sf data360 retrieve`                                         |
| **Outcome**  | `blocked` — no files were written for this calculated insight |

## What it means

The plugin reads a calculated insight twice before it writes any file: once through the native Data 360 API and once through the Metadata API. This code means that step stopped for a reason that has no more specific calculated-insight code, for example an unexpected error while reading or checking the response.

If Salesforce returned an error, the message carries the Salesforce detail and the request ID.

## Why the plugin stops

Without a complete, checked read the plugin cannot know what it would write. Writing a partial or guessed pair could produce local files that do not match the org.

## How to fix

1. Make sure the target org is authenticated and reachable: `sf org display -o <alias>`.
2. Check that the API name in `-m calculated-insight:Name__cio` is correct.
3. Read the Salesforce detail in the message, if any, and resolve it.
4. Rerun the retrieve.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_ACQUISITION_FAILED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The calculated insight could not be read and checked in the target org. Check access to the org and the API name, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_ACQUISITION_FAILED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_RUNTIME_UNKNOWN`](../calculated-insight/CI_RUNTIME_UNKNOWN.md) — the native read itself failed.
- [`CI_METADATA_AMBIGUOUS`](../calculated-insight/CI_METADATA_AMBIGUOUS.md) — the Metadata API read did not give one clear definition.
