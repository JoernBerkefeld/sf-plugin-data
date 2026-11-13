# `ACQUISITION_FAILED`

> The plugin could not read a DMO definition through the Metadata API. Check that the org session is valid and the DMO exists in the target, then rerun.

|              |                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                                     |
| **Commands** | `sf data360 retrieve`                                                                                       |
| **Outcome**  | `failed` — the affected component was not retrieved and no file was written for it; the org was not changed |

## What it means

Some families need a second, independent read of a data model object (DMO) through the Salesforce Metadata API, for example the DMO a calculated insight depends on, or the root DMO of a data graph. `ACQUISITION_FAILED` means that read did not return a usable answer: the request failed, the session could not be used, or the plugin's Metadata API client was not available.

When Salesforce returned an error, the message shows the HTTP status and any error code Salesforce sent. Response bodies are never printed.

## Why the plugin stops

The plugin only writes a file after every read it relies on has succeeded. Writing a file from a partial read would hide a dependency the plugin could not check, so the component is skipped and the run exits nonzero.

## How to fix

1. Check that the org session still works: `sf org display --target-org <alias>`. Log in again if it has expired.
2. Make sure the DMO named in the selection, or the DMO it depends on, exists in the target org and that your user can read it.
3. If the message mentions HTTP 429 or 503, wait and try again later.
4. Rerun the same `sf data360 retrieve` command.

## Example output

```text
Retrieve: failed.
calculated-insight:Lifetime_Value__cio: ACQUISITION_FAILED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The plugin could not read a DMO definition through the Metadata API. Check that the org session is valid and the DMO exists in the target, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/ACQUISITION_FAILED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`METADATA_REDIRECT_REFUSED`](../general/METADATA_REDIRECT_REFUSED.md) — the same Metadata API read, stopped because Salesforce answered with a redirect.
- [`AUTHENTICATION_FAILED`](../general/AUTHENTICATION_FAILED.md) — the session itself was rejected.
- [`RETRIEVE_FAILED`](../general/RETRIEVE_FAILED.md) — retrieve failed for a reason without a more specific code.
