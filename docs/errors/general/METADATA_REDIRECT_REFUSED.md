# `METADATA_REDIRECT_REFUSED`

> Salesforce answered a Metadata API read with a redirect, which the plugin does not follow. Check the My Domain and instance URL of the org, log in again, then rerun.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | General                                                                      |
| **Commands** | `sf data360 retrieve`                                                        |
| **Outcome**  | `failed` — the affected component was not retrieved; the org was not changed |

## What it means

When the plugin reads a DMO definition through the Metadata API (for example the DMO a calculated insight depends on), it refuses to follow HTTP redirects. `METADATA_REDIRECT_REFUSED` means Salesforce answered with a redirect instead of the data. This usually happens when the stored instance URL of the org no longer matches its current domain, for example after a My Domain change or an org migration.

## Why the plugin stops

Following a redirect would send the authenticated request to a different address than the one the session belongs to. The plugin refuses that and stops for this component.

## How to fix

1. Run `sf org display --target-org <alias>` and compare the instance URL with the org's current My Domain URL.
2. Log in again so the CLI stores the current URL: `sf org login web --alias <alias> --instance-url <My Domain URL>`.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
calculated-insight:Lifetime_Value__cio: METADATA_REDIRECT_REFUSED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: Salesforce answered a Metadata API read with a redirect, which the plugin does not follow. Check the My Domain and instance URL of the org, log in again, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/METADATA_REDIRECT_REFUSED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`ACQUISITION_FAILED`](../general/ACQUISITION_FAILED.md) — the same Metadata API read failed for another reason.
- [`AUTHENTICATION_FAILED`](../general/AUTHENTICATION_FAILED.md) — the session itself was rejected.
